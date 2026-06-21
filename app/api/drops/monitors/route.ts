import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("drop_monitors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ monitors: data ?? [] });
  } catch (err) {
    console.error("[drops/monitors GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.url) {
      return NextResponse.json({ error: "name and url required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("drop_monitors")
      .insert({
        name: body.name,
        url: body.url,
        check_interval_minutes: body.check_interval_minutes || 5,
        enabled: body.enabled ?? true,
        notify_telegram: body.notify_telegram ?? true,
        keywords: body.keywords || [],
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, monitor: data });
  } catch (err) {
    console.error("[drops/monitors POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
