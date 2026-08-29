import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Matches the agent's own default when config.js does not name the machine. */
const DEFAULT_MACHINE_ID = "desktop";

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

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("pc_metrics").delete().lt("recorded_at", cutoff);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[studio/pc-metrics POST]", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}

/**
 * Read side. Authentication is enforced in middleware, which admits either a
 * browser session cookie or `Authorization: Bearer PC_METRICS_SECRET` — the
 * latter for headless consumers that cannot hold a session. This route was
 * previously listed in PUBLIC_PREFIXES, which served the whole history,
 * diagnostic `raw` dump included, to anonymous callers.
 *
 * `?machine=` narrows to one reporter. Omitting it returns the newest rows
 * across all of them, which is the same thing while only the desktop reports.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const machine = req.nextUrl.searchParams.get("machine")?.trim();

    let query = supabase
      .from("pc_metrics")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(60);

    if (machine) query = query.eq("machine_id", machine);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Distinct machine_id, via a view because PostgREST cannot express DISTINCT
    // and pulling every row back to de-duplicate in JS would be absurd. A
    // failure here is not fatal: the selector is a convenience, the metrics are
    // the point, so fall back to whatever the rows themselves name.
    const { data: machineRows, error: machineErr } = await supabase
      .from("pc_metrics_machines")
      .select("machine_id");

    const machines = machineErr
      ? [...new Set((data ?? []).map((r) => r.machine_id).filter(Boolean))]
      : (machineRows ?? []).map((r) => r.machine_id).filter(Boolean).sort();

    if (machineErr) {
      console.error("[studio/pc-metrics GET] machine list", machineErr);
    }

    return NextResponse.json({
      current: data?.[0] ?? null,
      history: data ?? [],
      machines,
    });
  } catch (err) {
    console.error("[studio/pc-metrics GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
