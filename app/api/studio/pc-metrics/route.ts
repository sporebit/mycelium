import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Matches the agent's own default when config.js does not name the machine. */
const DEFAULT_MACHINE_ID = "desktop";

const RANGES = ["live", "24h", "7d"] as const;
type Range = (typeof RANGES)[number];

/** How many hourly buckets each bucketed range spans. */
const RANGE_HOURS: Record<Exclude<Range, "live">, number> = {
  "24h": 24,
  "7d": 24 * 7,
};

/** Raw samples returned for the live range — an hour at the 60s cadence. */
const LIVE_LIMIT = 60;

type BucketRow = Record<string, number | string | null>;

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.PC_METRICS_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const supabase = createServerClient();

    const { error } = await supabase.from("pc_metrics").insert({
      machine_id:
        typeof body.machine_id === "string" && body.machine_id.trim()
          ? body.machine_id.trim()
          : DEFAULT_MACHINE_ID,
      cpu_usage: body.cpu_usage ?? null,
      cpu_temp: body.cpu_temp ?? null,
      cpu_clock_mhz: body.cpu_clock_mhz ?? null,
      gpu_usage: body.gpu_usage ?? null,
      gpu_temp: body.gpu_temp ?? null,
      gpu_vram_used_mb: body.gpu_vram_used_mb ?? null,
      gpu_vram_total_mb: body.gpu_vram_total_mb ?? null,
      ram_used_gb: body.ram_used_gb ?? null,
      ram_total_gb: body.ram_total_gb ?? null,
      network_upload_mbps: body.network_upload_mbps ?? null,
      network_download_mbps: body.network_download_mbps ?? null,
      uptime_seconds: body.uptime_seconds ?? null,
      drives: body.drives ?? null,
      raw: body.raw ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Retention is not this endpoint's job. It used to issue a DELETE on every
    // POST: 1,440 statements a day on the ingest latency path to do one day's
    // work, and skipped entirely whenever the agent was offline, which is the
    // one time a backlog actually builds up. pg_cron owns it now, via
    // pc_metrics_prune() in migration 0095.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[studio/pc-metrics POST]", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}

/**
 * Projects an hourly rollup row onto the raw row's field names, so a bucketed
 * series and a live series are the same shape to every consumer. Averages take
 * the plain metric name; the maxima ride along under explicit `_max` names for
 * callers that want the peaks the average flattened out.
 */
function projectBucket(row: BucketRow, bucket: string) {
  const n = (k: string) => (row?.[k] as number | null) ?? null;
  return {
    id: `${row?.machine_id ?? ""}:${bucket}`,
    recorded_at: bucket,
    machine_id: (row?.machine_id as string | null) ?? null,
    cpu_usage: n("cpu_usage_avg"),
    cpu_temp: n("cpu_temp_avg"),
    cpu_clock_mhz: n("cpu_clock_mhz_avg"),
    gpu_usage: n("gpu_usage_avg"),
    gpu_temp: n("gpu_temp_avg"),
    gpu_vram_used_mb: n("gpu_vram_used_mb_avg"),
    gpu_vram_total_mb: n("gpu_vram_total_mb_max"),
    ram_used_gb: n("ram_used_gb_avg"),
    ram_total_gb: n("ram_total_gb_max"),
    network_upload_mbps: n("network_upload_mbps_avg"),
    network_download_mbps: n("network_download_mbps_avg"),
    // Meaningless once averaged across an hour; a gap is the honest answer.
    uptime_seconds: null,
    drives: null,
    samples: n("samples"),
    cpu_usage_max: n("cpu_usage_max"),
    gpu_usage_max: n("gpu_usage_max"),
    cpu_temp_max: n("cpu_temp_max"),
    gpu_temp_max: n("gpu_temp_max"),
  };
}

/**
 * Read side. Authentication is enforced in middleware, which admits either a
 * browser session cookie or `Authorization: Bearer PC_METRICS_SECRET`, the
 * latter for headless consumers that cannot hold a session. This route was
 * previously listed in PUBLIC_PREFIXES, which served the whole history,
 * diagnostic `raw` dump included, to anonymous callers.
 *
 * `?machine=` narrows to one reporter; omitted, it follows whichever machine
 * reported most recently. `?range=` selects live raw samples (default) or a
 * bucketed series read from the hourly rollup.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const params = req.nextUrl.searchParams;
    const machineParam = params.get("machine")?.trim() || null;

    const rangeParam = params.get("range")?.trim() ?? "live";
    const range: Range = (RANGES as readonly string[]).includes(rangeParam)
      ? (rangeParam as Range)
      : "live";

    // Distinct machine_id, via a view because PostgREST cannot express DISTINCT
    // and pulling every row back to de-duplicate in JS would be absurd. A
    // failure here is not fatal: the selector is a convenience, the metrics are
    // the point.
    const { data: machineRows, error: machineErr } = await supabase
      .from("pc_metrics_machines")
      .select("machine_id");
    if (machineErr) {
      console.error("[studio/pc-metrics GET] machine list", machineErr);
    }
    const machines = (machineRows ?? [])
      .map((r) => r.machine_id as string)
      .filter(Boolean)
      .sort();

    // The live snapshot always comes from raw, whatever range the charts show:
    // the stat panels are meant to read "right now", not "averaged over an
    // hour".
    let currentQuery = supabase
      .from("pc_metrics")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(1);
    if (machineParam) currentQuery = currentQuery.eq("machine_id", machineParam);

    const { data: currentRows, error: currentErr } = await currentQuery;
    if (currentErr) {
      return NextResponse.json({ error: currentErr.message }, { status: 500 });
    }
    const current = currentRows?.[0] ?? null;

    // Resolve a single machine for the series even when none was requested, so
    // two reporters can never interleave into one incoherent line.
    const machine = machineParam ?? current?.machine_id ?? null;

    if (range === "live") {
      let histQuery = supabase
        .from("pc_metrics")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(LIVE_LIMIT);
      if (machine) histQuery = histQuery.eq("machine_id", machine);

      const { data, error } = await histQuery;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        current,
        history: data ?? [],
        machines,
        range,
      });
    }

    const hours = RANGE_HOURS[range];
    const since = new Date(Date.now() - hours * 3600_000);
    since.setUTCMinutes(0, 0, 0);

    let bucketQuery = supabase
      .from("pc_metrics_hourly")
      .select("*")
      .gte("bucket", since.toISOString())
      .order("bucket", { ascending: false });
    if (machine) bucketQuery = bucketQuery.eq("machine_id", machine);

    const { data: buckets, error: bucketErr } = await bucketQuery;
    if (bucketErr) {
      return NextResponse.json({ error: bucketErr.message }, { status: 500 });
    }

    // An hour the agent never reported has no row at all. Emitting the full
    // series with explicit nulls is what keeps a gap looking like a gap: the
    // charts plot points in order with no time axis, so silently omitting an
    // hour would close the hole and draw a continuous line straight across a
    // three-hour outage.
    const byBucket = new Map<string, BucketRow>();
    for (const row of buckets ?? []) {
      byBucket.set(
        new Date(row.bucket as string).toISOString(),
        row as BucketRow,
      );
    }

    const topOfHour = new Date();
    topOfHour.setUTCMinutes(0, 0, 0);

    const history = [];
    for (let i = 0; i < hours; i++) {
      const at = new Date(topOfHour.getTime() - i * 3600_000).toISOString();
      const row = (byBucket.get(at) ?? { machine_id: machine }) as BucketRow;
      history.push(projectBucket(row, at));
    }

    return NextResponse.json({ current, history, machines, range });
  } catch (err) {
    console.error("[studio/pc-metrics GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
