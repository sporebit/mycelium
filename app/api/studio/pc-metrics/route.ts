import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("pc_metrics")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      current: data?.[0] ?? null,
      history: data ?? [],
    });
  } catch (err) {
    console.error("[studio/pc-metrics GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
