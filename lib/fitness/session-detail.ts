import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LoggedSession,
  LoggedSet,
  SessionDetail,
  SessionExercise,
  TemplateExercise,
} from "./types";

const SESSION_FIELDS =
  "id, date, slot, kind, name, programme_session_id, calories, notes, free_form_text, started_at, completed_at, status, created_at, updated_at";
// data_shape / with_weight were missing from both selects, so the log page
// received them as undefined and every exercise fell back to the sets-reps
// grid — the "hold" and "duration" shapes never rendered here.
const SESSION_EX_FIELDS =
  "id, session_id, position, name, notes, comment, rest_seconds, duration_min, distance_km, intensity, programme_exercise_id, save_to_template, skipped, completed_at, added_at, is_bodyweight, data_shape, with_weight";
const TEMPLATE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity, is_bodyweight, data_shape, with_weight, default_hold_seconds";

export async function loadSessionDetail(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SessionDetail | null> {
  const { data: sessionRow, error } = await supabase
    .from("workout_sessions")
    .select(SESSION_FIELDS)
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !sessionRow) return null;
  const session = sessionRow as LoggedSession;

  // Standing rules for the programme this session belongs to. Rendered as a
  // pinned banner at the top of the log so they are read during the workout
  // rather than sitting on a page nobody opens mid-set.
  let guardrails: string | null = null;
  if (session.programme_session_id) {
    const { data: tplSession } = await supabase
      .from("workout_programme_sessions")
      .select("programme_id")
      .eq("id", session.programme_session_id)
      .maybeSingle();
    const programmeId = (tplSession as { programme_id?: string } | null)
      ?.programme_id;
    if (programmeId) {
      const { data: programme } = await supabase
        .from("workout_programmes")
        .select("guardrails")
        .eq("id", programmeId)
        .maybeSingle();
      guardrails =
        (programme as { guardrails?: string | null } | null)?.guardrails ?? null;
    }
  }

  const { data: exRows } = await supabase
    .from("workout_session_exercises")
    .select(SESSION_EX_FIELDS)
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  const exercises = (exRows ?? []) as SessionExercise[];

  if (exercises.length === 0) {
    return { ...session, guardrails, exercises: [] };
  }

  const exIds = exercises.map((e) => e.id);
  const programmeExIds = exercises
    .map((e) => e.programme_exercise_id)
    .filter((x): x is string => !!x);

  const [setsResp, tplResp] = await Promise.all([
    supabase
      .from("workout_sets")
      .select("session_exercise_id, set_number, reps, weight, unit, completed_at")
      .in("session_exercise_id", exIds)
      .order("set_number", { ascending: true }),
    programmeExIds.length > 0
      ? supabase
          .from("workout_programme_exercises")
          .select(TEMPLATE_FIELDS)
          .in("id", programmeExIds)
      : Promise.resolve({ data: [] as TemplateExercise[] }),
  ]);
  const setRows = setsResp.data;
  const tplRows = tplResp.data;

  const setsByEx = new Map<string, LoggedSet[]>();
  for (const r of (setRows ?? []) as unknown as Array<
    LoggedSet & { session_exercise_id: string }
  >) {
    const list = setsByEx.get(r.session_exercise_id) ?? [];
    list.push({
      set_number: r.set_number,
      reps: r.reps,
      weight: r.weight,
      unit: r.unit,
      completed_at: r.completed_at,
    });
    setsByEx.set(r.session_exercise_id, list);
  }

  const tplById = new Map<string, TemplateExercise>();
  for (const t of (tplRows ?? []) as TemplateExercise[]) tplById.set(t.id, t);

  return {
    ...session,
    guardrails,
    exercises: exercises.map((ex) => ({
      ...ex,
      sets: setsByEx.get(ex.id) ?? [],
      template: ex.programme_exercise_id
        ? tplById.get(ex.programme_exercise_id) ?? null
        : null,
    })),
  };
}
