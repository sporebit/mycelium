import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";

export const runtime = "nodejs";

const SELECT =
  "id, entity_type, review_new, review_low_confidence, auto_create_threshold, created_at, space_id";
const TYPES = new Set(["person", "project", "workout", "food"]);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("entity_review_rules")
      .select(SELECT)
      .order("entity_type", { ascending: true });
    if (error) throw error;
    auditListRead(req, data, "organisation", "captures");
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
    const supabase = await createUserClient();
    // Upsert to handle the case where the seed never ran for this user.
    const { data, error } = await supabase
      .from("entity_review_rules")
      .upsert(
        { entity_type: body.entity_type,
          ...update,
        },
        { onConflict: "space_id,entity_type" },
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
