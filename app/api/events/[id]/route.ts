import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { pushEventToGoogle, removeGoogleEvent } from "@/lib/google/sync";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const updates: Record<string, unknown> = {};
    for (const f of ["title", "start_at", "end_at", "all_day", "location", "notes", "colour"]) {
      if (f in body) updates[f] = body[f];
    }
    const { data, error } = await supabase
      .from("events")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data) {
      pushEventToGoogle(data as {
        id: string; title: string; start_at: string;
        end_at?: string | null; all_day?: boolean;
        location?: string | null; notes?: string | null;
        google_event_id?: string | null;
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, event: data });
  } catch (err) {
    console.error("[events/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();

    const { data: existing } = await supabase
      .from("events")
      .select("google_event_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (existing?.google_event_id) {
      removeGoogleEvent("events", existing.google_event_id).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[events/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
