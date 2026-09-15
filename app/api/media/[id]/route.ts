import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { MEDIA_STATUSES, type MediaStatus } from "@/lib/types/media";
import { lookupStreaming } from "@/lib/media/streaming";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "title",
  "creator",
  "media_status",
  "rating",
  "notes",
  "tags",
  "url",
  "completed_at",
  "owned",
  "streaming_services",
  "streaming_checked_at",
  "review",
  "reviewed_at",
]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "media_status" && !MEDIA_STATUSES.includes(v as MediaStatus)) continue;
    if (k === "rating" && v !== null) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) continue;
    }
    if (k === "owned" && typeof v !== "boolean") continue;
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  if ("media_status" in update && !("completed_at" in update)) {
    if (update.media_status === "completed") {
      update.completed_at = new Date().toISOString();
    } else {
      update.completed_at = null;
    }
  }

  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("media_items")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }

    if ("title" in update && data.media_type === "watch") {
      lookupStreaming(data.id, data.title);
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error("[/api/media/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("media_items")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/media/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
