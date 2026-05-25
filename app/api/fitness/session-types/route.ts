import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { slugifyTypeKey } from "@/lib/fitness/slugify-type";
import type {
  SessionTypeLoggingMode,
  WorkoutSessionType,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const FIELDS =
  "id, user_id, type_key, label, is_builtin, typical_logging_mode, created_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_session_types")
      .select(FIELDS)
      .eq("user_id", uid)
      .order("label", { ascending: true });
    if (error) {
      console.error("[/api/fitness/session-types GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    return NextResponse.json({ types: (data ?? []) as WorkoutSessionType[] });
  } catch (err) {
    console.error("[/api/fitness/session-types GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  label?: string;
  typical_logging_mode?: SessionTypeLoggingMode;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }
  if (label.length > 30) {
    return NextResponse.json({ error: "label too long (max 30)" }, { status: 400 });
  }
  const typeKey = slugifyTypeKey(label);
  if (!typeKey) {
    return NextResponse.json({ error: "invalid label" }, { status: 400 });
  }
  const mode: SessionTypeLoggingMode =
    body.typical_logging_mode === "simple" ? "simple" : "full";

  try {
    const supabase = createServerClient();
    // Case-insensitive duplicate check on label, since the slug may collapse
    // distinct labels ("Hot Yoga" and "Hot-Yoga" both → hot_yoga).
    const { data: existing } = await supabase
      .from("workout_session_types")
      .select("id, label")
      .eq("user_id", uid)
      .or(`type_key.eq.${typeKey},label.ilike.${label}`)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `You already have a type called '${(existing[0] as { label: string }).label}'` },
        { status: 409 }
      );
    }
    const { data, error } = await supabase
      .from("workout_session_types")
      .insert({
        user_id: uid,
        type_key: typeKey,
        label,
        is_builtin: false,
        typical_logging_mode: mode,
      })
      .select(FIELDS)
      .single();
    if (error || !data) {
      console.error("[/api/fitness/session-types POST]", error);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }
    return NextResponse.json({ type: data as WorkoutSessionType });
  } catch (err) {
    console.error("[/api/fitness/session-types POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
