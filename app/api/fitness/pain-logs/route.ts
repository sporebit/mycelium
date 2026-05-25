import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ExercisePainLog, FeelRating } from "@/lib/fitness/types";

export const runtime = "nodejs";

const LOG_FIELDS =
  "id, user_id, session_exercise_id, severity, feel_rating, pain_regions, notes, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  session_exercise_id?: string;
  severity?: number | null;
  feel_rating?: FeelRating | null;
  pain_regions?: string[] | null;
  notes?: string | null;
};

const VALID_RATINGS: FeelRating[] = [
  "great",
  "good",
  "ok",
  "mild",
  "moderate",
  "painful",
  "stopped",
];

/**
 * Upsert a pain log keyed by session_exercise_id. We treat the relationship as
 * 1:1 — there's only ever one pain entry per logged exercise per session,
 * because anything else would be hard to reason about in the UI.
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.session_exercise_id) {
    return NextResponse.json({ error: "session_exercise_id required" }, { status: 400 });
  }
  if (body.severity != null && (body.severity < 0 || body.severity > 10)) {
    return NextResponse.json({ error: "severity out of range" }, { status: 400 });
  }
  if (body.feel_rating != null && !VALID_RATINGS.includes(body.feel_rating)) {
    return NextResponse.json({ error: "invalid feel_rating" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    // Verify the session_exercise belongs to this user
    const { data: ex } = await supabase
      .from("workout_session_exercises")
      .select("id, workout_sessions:session_id!inner(user_id)")
      .eq("id", body.session_exercise_id)
      .maybeSingle();
    const joined =
      (ex as { workout_sessions?: { user_id?: string } | { user_id?: string }[] } | null)
        ?.workout_sessions;
    const ownerId = Array.isArray(joined) ? joined[0]?.user_id : joined?.user_id;
    if (!ex || ownerId !== uid) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Existing log for this session_exercise?
    const { data: existing } = await supabase
      .from("exercise_pain_logs")
      .select("id")
      .eq("session_exercise_id", body.session_exercise_id)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existing?.id) {
      const { data, error } = await supabase
        .from("exercise_pain_logs")
        .update({
          severity: body.severity ?? null,
          feel_rating: body.feel_rating ?? null,
          pain_regions: body.pain_regions ?? null,
          notes: body.notes ?? null,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select(LOG_FIELDS)
        .single();
      if (error) {
        console.error("[/api/fitness/pain-logs POST update]", error);
        return NextResponse.json({ error: "save failed" }, { status: 500 });
      }
      return NextResponse.json({ pain_log: data as ExercisePainLog, updated: true });
    }

    const { data, error } = await supabase
      .from("exercise_pain_logs")
      .insert({
        user_id: uid,
        session_exercise_id: body.session_exercise_id,
        severity: body.severity ?? null,
        feel_rating: body.feel_rating ?? null,
        pain_regions: body.pain_regions ?? null,
        notes: body.notes ?? null,
      })
      .select(LOG_FIELDS)
      .single();
    if (error) {
      console.error("[/api/fitness/pain-logs POST insert]", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
    return NextResponse.json({ pain_log: data as ExercisePainLog, updated: false });
  } catch (err) {
    console.error("[/api/fitness/pain-logs POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

/** GET pain logs for a session — joins through session_exercises to filter. */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    // Ownership check + collect session_exercise ids in one query
    const { data: exRows } = await supabase
      .from("workout_session_exercises")
      .select(
        "id, workout_sessions:session_id!inner(user_id, id)"
      )
      .eq("session_id", sessionId);
    type ExRow = {
      id: string;
      workout_sessions:
        | { user_id?: string; id?: string }
        | { user_id?: string; id?: string }[];
    };
    const exIds: string[] = [];
    for (const r of (exRows ?? []) as ExRow[]) {
      const j = Array.isArray(r.workout_sessions) ? r.workout_sessions[0] : r.workout_sessions;
      if (j?.user_id === uid) exIds.push(r.id);
    }
    if (exIds.length === 0) return NextResponse.json({ pain_logs: [] });

    const { data: logs } = await supabase
      .from("exercise_pain_logs")
      .select(LOG_FIELDS)
      .in("session_exercise_id", exIds);
    return NextResponse.json({ pain_logs: (logs ?? []) as ExercisePainLog[] });
  } catch (err) {
    console.error("[/api/fitness/pain-logs GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
