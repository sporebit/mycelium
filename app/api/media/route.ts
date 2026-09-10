import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { MEDIA_TYPES, MEDIA_STATUSES, type MediaType, type MediaStatus } from "@/lib/types/media";
import { lookupStreaming } from "@/lib/media/streaming";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mediaType = url.searchParams.get("media_type") as MediaType | null;
  const status = url.searchParams.get("status") as MediaStatus | null;

  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("media_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (mediaType && MEDIA_TYPES.includes(mediaType)) {
      q = q.eq("media_type", mediaType);
    }
    if (status && MEDIA_STATUSES.includes(status)) {
      q = q.eq("media_status", status);
    }

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    console.error("[/api/media GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  title?: string;
  creator?: string | null;
  media_type?: MediaType;
  media_status?: MediaStatus;
  notes?: string | null;
  tags?: string[];
  url?: string | null;
};

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const mediaType = body.media_type;
  if (!mediaType || !MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json({ error: "valid media_type required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("media_items")
      .insert({
        title,
        creator: body.creator?.trim() || null,
        media_type: mediaType,
        media_status: body.media_status && MEDIA_STATUSES.includes(body.media_status)
          ? body.media_status
          : "backlog",
        notes: body.notes?.trim() || null,
        tags: Array.isArray(body.tags) ? body.tags : null,
        url: body.url?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");

    if (mediaType === "watch") {
      lookupStreaming(data.id, title);
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error("[/api/media POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
