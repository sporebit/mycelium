import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { pushEventToGoogle } from "@/lib/google/sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("start_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("start_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ events: data });
  } catch (err) {
    console.error("[events GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.title || !body.start_at) {
      return NextResponse.json({ error: "title and start_at required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: body.title,
        start_at: body.start_at,
        end_at: body.end_at || null,
        all_day: body.all_day ?? false,
        location: body.location || null,
        notes: body.notes || null,
        colour: body.colour || "#e8e6dd",
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data) {
      pushEventToGoogle(data as {
        id: string; title: string; start_at: string;
        end_at?: string | null; all_day?: boolean;
        location?: string | null; notes?: string | null;
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, event: data });
  } catch (err) {
    console.error("[events POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
