import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("media_episodes")
      .select("*")
      .eq("item_id", id)
      .order("listened_at", { ascending: false, nullsFirst: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ episodes: data });
  } catch (err) {
    console.error("[media/:id/episodes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (!body.title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("media_episodes")
      .insert({
        item_id: id,
        title: body.title,
        episode_number: body.episode_number ?? null,
        season_number: body.season_number ?? null,
        duration_minutes: body.duration_minutes ?? null,
        listened_at: body.listened_at || new Date().toISOString(),
        rating: body.rating ?? null,
        comments: body.comments || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, episode: data });
  } catch (err) {
    console.error("[media/:id/episodes POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
