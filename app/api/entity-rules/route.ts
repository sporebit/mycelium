import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const SELECT =
  "id, user_id, entity_type, review_new, review_low_confidence, auto_create_threshold, created_at";
const TYPES = new Set(["person", "project", "workout", "food"]);

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("entity_review_rules")
      .select(SELECT)
      .eq("user_id", uid)
      .order("entity_type", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ rules: data ?? [] });
  } catch (err) {
    console.error("[/api/entity-rules GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type PatchBody = {
  entity_type?: string;
  review_new?: boolean;
  review_low_confidence?: boolean;
  auto_create_threshold?: number;
};

export async function PATCH(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.entity_type || !TYPES.has(body.entity_type)) {
    return NextResponse.json({ error: "entity_type required" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.review_new === "boolean") update.review_new = body.review_new;
  if (typeof body.review_low_confidence === "boolean") {
    update.review_low_confidence = body.review_low_confidence;
  }
  if (typeof body.auto_create_threshold === "number") {
    update.auto_create_threshold = Math.max(
      0,
      Math.floor(body.auto_create_threshold),
    );
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    // Upsert to handle the case where the seed never ran for this user.
    const { data, error } = await supabase
      .from("entity_review_rules")
      .upsert(
        {
          user_id: uid,
          entity_type: body.entity_type,
          ...update,
        },
        { onConflict: "user_id,entity_type" },
      )
      .select(SELECT)
      .single();
    if (error || !data) throw error ?? new Error("upsert failed");
    return NextResponse.json({ rule: data });
  } catch (err) {
    console.error("[/api/entity-rules PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
