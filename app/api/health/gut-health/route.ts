import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("gut_health_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data });
  } catch (err) {
    console.error("[gut-health GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.bristol_type || body.bristol_type < 1 || body.bristol_type > 7) {
      return NextResponse.json({ error: "bristol_type (1-7) required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("gut_health_logs")
      .insert({
        bristol_type: body.bristol_type,
        time_of_day: body.time_of_day || null,
        felt_finished: body.felt_finished ?? null,
        wipe_type: body.wipe_type || null,
        discomfort: body.discomfort ?? null,
        blood: body.blood ?? false,
        urgent: body.urgent ?? false,
        notes: body.notes || null,
        logged_at: body.logged_at || new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("[gut-health POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
