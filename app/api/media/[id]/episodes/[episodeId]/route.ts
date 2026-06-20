import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; episodeId: string }> },
) {
  try {
    const { episodeId } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const updates: Record<string, unknown> = {};
    for (const f of ["title", "episode_number", "season_number", "duration_minutes", "listened_at", "rating", "comments"]) {
      if (f in body) updates[f] = body[f];
    }
    const { data, error } = await supabase
      .from("media_episodes")
      .update(updates)
      .eq("id", episodeId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, episode: data });
  } catch (err) {
    console.error("[media/:id/episodes/:episodeId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; episodeId: string }> },
) {
  try {
    const { episodeId } = await ctx.params;
    const supabase = createServerClient();
    const { error } = await supabase.from("media_episodes").delete().eq("id", episodeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[media/:id/episodes/:episodeId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
