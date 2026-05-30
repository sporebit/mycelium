import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ExercisePainLog, FeelRating } from "@/lib/fitness/types";

export const runtime = "nodejs";

const LOG_FIELDS =
  "id, user_id, session_id, session_exercise_id, exercise_name, severity, feel_rating, pain_regions, notes, logged_at, created_at, updated_at";

const VALID_RATINGS: FeelRating[] = [
  "great",
  "good",
  "ok",
  "mild",
  "moderate",
  "painful",
  "stopped",
];

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  session_id?: string;
  /** Null/omitted = session-level pain note (exercise_name = 'session'). */
  session_exercise_id?: string | null;
  exercise_name?: string;
  severity?: number;
  feel_rating?: FeelRating | null;
  pain_regions?: string[];
  notes?: string | null;
  logged_at?: string;
};

/**
 * Upsert a pain log. For exercise-level rows we key on session_exercise_id
 * (1:1 with the logged exercise). Session-level rows (no
 * session_exercise_id, exercise_name='session') key on session_id and
 * are also treated as 1:1.
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

  if (!body.session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  if (
    typeof body.severity !== "number" ||
    body.severity < 0 ||
    body.severity > 10
  ) {
    return NextResponse.json(
      { error: "severity required (0-10)" },
      { status: 400 },
    );
  }
  if (body.feel_rating != null && !VALID_RATINGS.includes(body.feel_rating)) {
    return NextResponse.json({ error: "invalid feel_rating" }, { status: 400 });
  }
  const sessionExerciseId = body.session_exercise_id ?? null;
  const exerciseName =
    body.exercise_name?.trim() ||
    (sessionExerciseId ? null : "session"); // session-level default

  try {
    const supabase = createServerClient();

    // Ownership check via the session row. Done in one query instead of
    // joining through workout_session_exercises so session-level logs
    // (no session_exercise_id) work identically.
    const { data: session } = await supabase
      .from("workout_sessions")
      .select("id, user_id")
      .eq("id", body.session_id)
      .maybeSingle();
    if (!session || session.user_id !== uid) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    let resolvedExerciseName: string | null = exerciseName;
    if (sessionExerciseId) {
      // Verify the session_exercise belongs to this session, and pull
      // its canonical name to denormalise.
      const { data: ex } = await supabase
        .from("workout_session_exercises")
        .select("id, name, session_id")
        .eq("id", sessionExerciseId)
        .maybeSingle();
      if (!ex || ex.session_id !== body.session_id) {
        return NextResponse.json(
          { error: "session_exercise not in session" },
          { status: 400 },
        );
      }
      resolvedExerciseName = exerciseName ?? (ex.name as string);
    }
    if (!resolvedExerciseName) {
      return NextResponse.json(
        { error: "exercise_name required" },
        { status: 400 },
      );
    }

    // Look up an existing 1:1 row to upsert into. Exercise-level rows
    // key on session_exercise_id; session-level rows key on
    // (session_id, session_exercise_id IS NULL).
    let existingQuery = supabase
      .from("exercise_pain_logs")
      .select("id")
      .eq("session_id", body.session_id);
    if (sessionExerciseId) {
      existingQuery = existingQuery.eq("session_exercise_id", sessionExerciseId);
    } else {
      existingQuery = existingQuery.is("session_exercise_id", null);
    }
    const { data: existing } = await existingQuery.maybeSingle();

    const now = new Date().toISOString();
    const loggedAt =
      typeof body.logged_at === "string" && body.logged_at
        ? body.logged_at
        : now;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("exercise_pain_logs")
        .update({
          severity: body.severity,
          feel_rating: body.feel_rating ?? null,
          pain_regions: Array.isArray(body.pain_regions)
            ? body.pain_regions
            : [],
          notes: body.notes ?? null,
          logged_at: loggedAt,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select(LOG_FIELDS)
        .single();
      if (error || !data) {
        console.error("[/api/fitness/pain-logs POST update]", error);
        return NextResponse.json({ error: "save failed" }, { status: 500 });
      }
      return NextResponse.json({
        pain_log: data as ExercisePainLog,
        updated: true,
      });
    }

    const { data, error } = await supabase
      .from("exercise_pain_logs")
      .insert({
        user_id: uid,
        session_id: body.session_id,
        session_exercise_id: sessionExerciseId,
        exercise_name: resolvedExerciseName,
        severity: body.severity,
        feel_rating: body.feel_rating ?? null,
        pain_regions: Array.isArray(body.pain_regions) ? body.pain_regions : [],
        notes: body.notes ?? null,
        logged_at: loggedAt,
      })
      .select(LOG_FIELDS)
      .single();
    if (error || !data) {
      console.error("[/api/fitness/pain-logs POST insert]", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
    return NextResponse.json({
      pain_log: data as ExercisePainLog,
      updated: false,
    });
  } catch (err) {
    console.error("[/api/fitness/pain-logs POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

/** GET pain logs.
 *
 * Accepts:
 *   ?session_id=X    — all logs for a session (incl. session-level)
 *   ?exercise_name=X — all logs across sessions for an exercise (for
 *                      the pain-history chart on /fitness/history/exercise/[name])
 */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const exerciseName = req.nextUrl.searchParams.get("exercise_name");
  if (!sessionId && !exerciseName) {
    return NextResponse.json(
      { error: "session_id or exercise_name required" },
      { status: 400 },
    );
  }
  try {
    const supabase = createServerClient();
    let q = supabase
      .from("exercise_pain_logs")
      .select(LOG_FIELDS)
      .eq("user_id", uid)
      .order("logged_at", { ascending: false });
    if (sessionId) q = q.eq("session_id", sessionId);
    if (exerciseName) q = q.eq("exercise_name", exerciseName);
    const { data: logs, error } = await q;
    if (error) throw error;
    return NextResponse.json({ pain_logs: (logs ?? []) as ExercisePainLog[] });
  } catch (err) {
    console.error("[/api/fitness/pain-logs GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
