import { createServerClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/util/date";
import { isoWeekString } from "@/lib/util/week";
import { FEEL_EMOJI } from "@/lib/fitness/pain";
import { parseWorkoutVoice, type VoiceContext } from "./voice-parse";
import type {
  ParsedWorkout,
  PendingButtonOption,
  PendingWorkoutRoute,
  SessionKind,
  Slot,
  TemplateExercise,
  VoiceRouteResult,
  WeightUnit,
} from "./types";

type Supabase = ReturnType<typeof createServerClient>;

/** Build the context object passed into the LLM parser. */
export async function buildVoiceContext(
  supabase: Supabase,
  userId: string
): Promise<VoiceContext> {
  const today = localDateKey();

  // Today's started workout_sessions
  const { data: liveRows } = await supabase
    .from("workout_sessions")
    .select(
      "id, programme_session_id, slot, kind, name, started_at, completed_at"
    )
    .eq("user_id", userId)
    .eq("date", today);

  type Live = {
    id: string;
    programme_session_id: string | null;
    slot: string;
    kind: string;
    name: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  const live = (liveRows ?? []) as Live[];
  const liveByPS = new Map<string, Live>();
  for (const l of live) {
    if (l.programme_session_id) liveByPS.set(l.programme_session_id, l);
  }

  // Today's planned template sessions
  const tz = process.env.USER_TIMEZONE ?? "Europe/London";
  const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const currentWeek = isoWeekString(nowLocal);
  const dow = (nowLocal.getDay() + 6) % 7; // JS Sun=0 → programme Mon=0

  const { data: phaseRows } = await supabase
    .from("workout_programme_phases")
    .select("programme_id, start_week_iso, end_week_iso")
    .eq("user_id", userId)
    .lte("start_week_iso", currentWeek)
    .or(`end_week_iso.is.null,end_week_iso.gte.${currentWeek}`)
    .order("start_week_iso", { ascending: false })
    .limit(1);
  const activePhase = (phaseRows ?? [])[0] as
    | { programme_id: string }
    | undefined;

  const sessions: VoiceContext["sessions"] = [];

  // Live sessions (active + completed) first
  for (const l of live) {
    const exNames = await fetchSessionExerciseNames(supabase, l.id);
    sessions.push({
      session_id: l.id,
      programme_session_id: l.programme_session_id,
      slot: l.slot,
      kind: l.kind,
      name: l.name,
      state: l.completed_at ? "completed" : "active",
      exercise_names: exNames,
    });
  }

  // Planned sessions from today's template (only those not already started)
  if (activePhase?.programme_id) {
    const { data: tplSessions } = await supabase
      .from("workout_programme_sessions")
      .select("id, slot, kind, name")
      .eq("programme_id", activePhase.programme_id)
      .eq("day_of_week", dow);
    const tplIds = (tplSessions ?? []).map((s) => (s as { id: string }).id);
    let exByPS = new Map<string, string[]>();
    if (tplIds.length > 0) {
      const { data: tplExs } = await supabase
        .from("workout_programme_exercises")
        .select("programme_session_id, name, position")
        .in("programme_session_id", tplIds)
        .order("position", { ascending: true });
      exByPS = new Map();
      for (const e of (tplExs ?? []) as Array<{
        programme_session_id: string;
        name: string;
      }>) {
        const list = exByPS.get(e.programme_session_id) ?? [];
        list.push(e.name);
        exByPS.set(e.programme_session_id, list);
      }
    }
    for (const t of (tplSessions ?? []) as Array<{
      id: string;
      slot: string;
      kind: string;
      name: string;
    }>) {
      if (liveByPS.has(t.id)) continue; // already started
      sessions.push({
        session_id: null,
        programme_session_id: t.id,
        slot: t.slot,
        kind: t.kind,
        name: t.name,
        state: "planned",
        exercise_names: exByPS.get(t.id) ?? [],
      });
    }
  }

  const { data: baselineRows } = await supabase
    .from("exercise_baselines")
    .select("exercise_name")
    .eq("user_id", userId);
  const baselineNames = (baselineRows ?? []).map(
    (r) => (r as { exercise_name: string }).exercise_name
  );

  return {
    today_date: today,
    sessions,
    baseline_names: baselineNames,
  };
}

async function fetchSessionExerciseNames(
  supabase: Supabase,
  sessionId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("workout_session_exercises")
    .select("name")
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name);
}

/** Main entry — parse if needed, then route. */
export async function routeRawVoice(
  rawText: string,
  userId: string
): Promise<
  | { kind: "routed"; result: VoiceRouteResult }
  | { kind: "pending"; pending_route_id: string; parsed: ParsedWorkout }
> {
  const supabase = createServerClient();
  const context = await buildVoiceContext(supabase, userId);
  const parsed = await parseWorkoutVoice(rawText, context);
  return await applyDecisionTree(supabase, userId, rawText, parsed, context);
}

/** Re-resolve a pending route by user's explicit selection. */
export async function resolvePendingRoute(
  pendingId: string,
  userId: string,
  resolution: "active" | "planned" | "new_extra",
  sessionId?: string | null
): Promise<VoiceRouteResult | null> {
  const supabase = createServerClient();
  const { data: pendingRow } = await supabase
    .from("pending_workout_routes")
    .select("id, user_id, raw_text, parsed_payload, expires_at")
    .eq("id", pendingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!pendingRow) return null;
  const pending = pendingRow as PendingWorkoutRoute;
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return null;
  }

  const context = await buildVoiceContext(supabase, userId);
  let intent: ParsedWorkout["session_intent"];
  if (resolution === "active") intent = "active";
  else if (resolution === "planned") intent = "planned";
  else intent = "create_extra";

  const overridden: ParsedWorkout = {
    ...pending.parsed_payload,
    session_intent: intent,
    candidate_session_ids: sessionId ? [sessionId] : pending.parsed_payload.candidate_session_ids,
  };
  // force_session_id is a workout_sessions.id — only valid for "active".
  // For "planned", sessionId is a programme_session_id; let applyDecisionTree's
  // planned branch run startSessionFromTemplate to materialise a live row.
  const force =
    resolution === "active" && sessionId ? sessionId : undefined;
  const r = await applyDecisionTree(
    supabase,
    userId,
    pending.raw_text,
    overridden,
    context,
    { force_session_id: force }
  );

  // Delete the pending row on success
  if (r.kind === "routed") {
    await supabase.from("pending_workout_routes").delete().eq("id", pendingId);
    return r.result;
  }
  return null;
}

type DecisionOpts = { force_session_id?: string };

async function applyDecisionTree(
  supabase: Supabase,
  userId: string,
  rawText: string,
  parsed: ParsedWorkout,
  context: VoiceContext,
  opts: DecisionOpts = {}
): Promise<
  | { kind: "routed"; result: VoiceRouteResult }
  | { kind: "pending"; pending_route_id: string; parsed: ParsedWorkout }
> {
  if (opts.force_session_id) {
    return {
      kind: "routed",
      result: await writeToSession(
        supabase,
        userId,
        opts.force_session_id,
        parsed,
        rawText
      ),
    };
  }

  const liveSessions = context.sessions.filter((s) => s.state === "active");
  const plannedSessions = context.sessions.filter((s) => s.state === "planned");

  // Resolve the intent against actual server state
  let effective = parsed.session_intent;
  if (effective === "active" && liveSessions.length === 0) {
    // No active session — fall back to planned if there's a unique candidate
    effective = plannedSessions.length === 1 ? "planned" : "create_extra";
  }
  if (effective === "planned" && plannedSessions.length === 0) {
    effective = "create_extra";
  }

  // Active
  if (effective === "active") {
    if (liveSessions.length === 1) {
      const sid = liveSessions[0].session_id!;
      return {
        kind: "routed",
        result: await writeToSession(supabase, userId, sid, parsed, rawText),
      };
    }
    // multiple active is rare — defer to ambiguous
    return await stashPending(supabase, userId, rawText, parsed);
  }

  // Planned
  if (effective === "planned") {
    let target = plannedSessions[0];
    if (
      parsed.candidate_session_ids.length > 0 &&
      plannedSessions.length > 1
    ) {
      const wanted = parsed.candidate_session_ids[0];
      const found = plannedSessions.find(
        (s) => s.programme_session_id === wanted || s.session_id === wanted
      );
      if (found) target = found;
    } else if (plannedSessions.length > 1 && parsed.candidate_session_ids.length === 0) {
      // Can't tell which one — ambiguous
      return await stashPending(supabase, userId, rawText, parsed);
    }
    const sid = await startSessionFromTemplate(
      supabase,
      userId,
      target.programme_session_id!,
      target.slot,
      target.kind,
      target.name ?? null
    );
    if (!sid) {
      return await stashPending(supabase, userId, rawText, parsed);
    }
    return {
      kind: "routed",
      result: await writeToSession(supabase, userId, sid, parsed, rawText),
    };
  }

  // Ambiguous
  if (effective === "ambiguous") {
    return await stashPending(supabase, userId, rawText, parsed);
  }

  // Create extra
  const sid = await createExtraSession(supabase, userId, parsed, rawText);
  return {
    kind: "routed",
    result: await writeToSession(supabase, userId, sid, parsed, rawText),
  };
}

async function stashPending(
  supabase: Supabase,
  userId: string,
  rawText: string,
  parsed: ParsedWorkout
): Promise<{ kind: "pending"; pending_route_id: string; parsed: ParsedWorkout }> {
  // Build the button-snapshot from current context — so callback can route
  // even if state shifts between message and tap.
  const context = await buildVoiceContext(supabase, userId);
  const buttonOptions: PendingButtonOption[] = [];
  for (const s of context.sessions) {
    if (s.state === "completed") continue; // don't offer completed sessions
    const sid = s.session_id ?? s.programme_session_id;
    if (!sid) continue;
    buttonOptions.push({
      session_id: sid,
      state: s.state === "active" ? "active" : "planned",
      name: s.name,
      slot: s.slot,
      kind: s.kind,
    });
  }
  // Always also offer "new extra session"
  buttonOptions.push({
    session_id: "__extra__",
    state: "extra",
    name: "New extra session",
    slot: "extra",
    kind: "other",
  });

  const { data } = await supabase
    .from("pending_workout_routes")
    .insert({
      user_id: userId,
      raw_text: rawText,
      parsed_payload: parsed,
      button_options: buttonOptions,
    })
    .select("id")
    .single();
  return {
    kind: "pending",
    pending_route_id: (data?.id as string) ?? "",
    parsed,
  };
}

/**
 * Resolve a pending row by the user's button index. Looks up the choice in
 * the stored button_options snapshot, derives the right resolution + session,
 * and runs the writer.
 */
export async function resolvePendingByIndex(
  pendingId: string,
  userId: string,
  index: number
): Promise<VoiceRouteResult | null> {
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("pending_workout_routes")
    .select("id, user_id, raw_text, parsed_payload, button_options, expires_at")
    .eq("id", pendingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;
  const pending = row as PendingWorkoutRoute;
  if (new Date(pending.expires_at).getTime() < Date.now()) return null;
  const choice = pending.button_options[index];
  if (!choice) return null;

  if (choice.state === "extra") {
    return await resolvePendingRoute(pendingId, userId, "new_extra");
  }
  if (choice.state === "active") {
    return await resolvePendingRoute(pendingId, userId, "active", choice.session_id);
  }
  // planned — but the session might have been started since stashing
  const today = localDateKey();
  const { data: live } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("programme_session_id", choice.session_id)
    .maybeSingle();
  if (live?.id) {
    return await resolvePendingRoute(pendingId, userId, "active", live.id as string);
  }
  return await resolvePendingRoute(pendingId, userId, "planned", choice.session_id);
}

/** Look up the pending row by 8-char prefix (used by Telegram callbacks). */
export async function findPendingByPrefix(
  userId: string,
  prefix: string
): Promise<PendingWorkoutRoute | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("pending_workout_routes")
    .select("id, short_id, user_id, raw_text, parsed_payload, button_options, expires_at, created_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .eq("short_id", prefix)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return data[0] as PendingWorkoutRoute;
}

/** Look up the pending row by full UUID. Use this when the full id is in hand. */
export async function findPendingById(
  userId: string,
  id: string
): Promise<PendingWorkoutRoute | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("pending_workout_routes")
    .select("id, short_id, user_id, raw_text, parsed_payload, button_options, expires_at, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return data as PendingWorkoutRoute;
}

async function startSessionFromTemplate(
  supabase: Supabase,
  userId: string,
  programmeSessionId: string,
  slot: string,
  kind: string,
  name: string | null
): Promise<string | null> {
  const today = localDateKey();
  // Idempotency check — re-use any existing session for today/template
  const { data: existing } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("programme_session_id", programmeSessionId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // Copy template exercises into session_exercises (same logic as POST /sessions)
  const { data: tplExs } = await supabase
    .from("workout_programme_exercises")
    .select(
      "id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity"
    )
    .eq("programme_session_id", programmeSessionId)
    .order("position", { ascending: true });

  const { data: created } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: userId,
      date: today,
      slot: slot as Slot,
      kind: kind as SessionKind,
      name,
      programme_session_id: programmeSessionId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!created?.id) return null;

  if (tplExs && tplExs.length > 0) {
    const rows = (tplExs as TemplateExercise[]).map((t) => ({
      session_id: created.id,
      position: t.position,
      name: t.name,
      notes: t.notes,
      rest_seconds: t.rest_seconds ?? 90,
      duration_min: t.default_duration_min,
      distance_km: t.default_distance_km,
      intensity: t.default_intensity,
      programme_exercise_id: t.id,
      save_to_template: false,
      skipped: false,
    }));
    await supabase.from("workout_session_exercises").insert(rows);
  }
  return created.id as string;
}

async function createExtraSession(
  supabase: Supabase,
  userId: string,
  parsed: ParsedWorkout,
  rawText: string
): Promise<string> {
  const today = localDateKey();
  // Infer kind
  let kind: SessionKind = "other";
  if (parsed.parsed_exercises.length > 0) kind = "resistance";
  else if (parsed.cardio_entries.length > 0) kind = "cardio";

  // Infer name
  let name = parsed.session_notes ?? "";
  if (!name && parsed.cardio_entries[0]?.raw_phrase) {
    name = parsed.cardio_entries[0].raw_phrase;
  }
  if (!name && parsed.parsed_exercises[0]?.raw_phrase) {
    name = parsed.parsed_exercises[0].raw_phrase;
  }
  if (!name) name = rawText.slice(0, 60);
  name = name.length > 80 ? name.slice(0, 77) + "…" : name;

  const { data: created } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: userId,
      date: today,
      slot: "extra" as Slot,
      kind,
      name,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      free_form_text: rawText,
    })
    .select("id")
    .single();
  return (created?.id as string) ?? "";
}

/**
 * Resolve a session_exercise for a parsed exercise — either by name match
 * against the session's existing rows, or by inserting a new one. Returns
 * the row id and the starting set_number to use when appending new sets.
 */
async function ensureSessionExercise(
  supabase: Supabase,
  sessionId: string,
  matchedName: string | null,
  rawPhrase: string
): Promise<{ id: string; nextSetNumber: number } | null> {
  const targetName = matchedName ?? rawPhrase.trim();
  if (!targetName) return null;

  const { data: existing } = await supabase
    .from("workout_session_exercises")
    .select("id, position")
    .eq("session_id", sessionId)
    .ilike("name", targetName)
    .maybeSingle();

  let exId: string;
  if (existing?.id) {
    exId = existing.id as string;
  } else {
    const { data: maxRow } = await supabase
      .from("workout_session_exercises")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;
    const { data: inserted } = await supabase
      .from("workout_session_exercises")
      .insert({
        session_id: sessionId,
        position: nextPos,
        name: targetName,
        rest_seconds: 90,
        save_to_template: false,
        skipped: false,
      })
      .select("id")
      .single();
    if (!inserted?.id) return null;
    exId = inserted.id as string;
  }

  // Determine where to append — use max(existing set_number) + 1
  const { data: maxSet } = await supabase
    .from("workout_sets")
    .select("set_number")
    .eq("session_exercise_id", exId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSetNumber = ((maxSet?.set_number as number | undefined) ?? 0) + 1;
  return { id: exId, nextSetNumber };
}

async function writeToSession(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  parsed: ParsedWorkout,
  rawText: string
): Promise<VoiceRouteResult> {
  let exercisesLogged = 0;
  let setsLogged = 0;
  let painLogs = 0;
  let cardioLogged = 0;

  // 1. Resistance exercises
  for (const ex of parsed.parsed_exercises) {
    const resolved = await ensureSessionExercise(
      supabase,
      sessionId,
      ex.matched_exercise_name,
      ex.raw_phrase
    );
    if (!resolved) continue;
    exercisesLogged += 1;
    const setRows = ex.sets.map((s, i) => ({
      session_exercise_id: resolved.id,
      set_number: resolved.nextSetNumber + i,
      reps: s.reps,
      weight: s.weight,
      unit: (s.unit ?? "kg") as WeightUnit,
      completed_at: new Date().toISOString(),
    }));
    if (setRows.length > 0) {
      const { error } = await supabase
        .from("workout_sets")
        .upsert(setRows, { onConflict: "session_exercise_id,set_number" });
      if (!error) setsLogged += setRows.length;
    }
  }

  // 2. Cardio entries (no sets, just duration/distance/intensity on the row)
  for (const c of parsed.cardio_entries) {
    const resolved = await ensureSessionExercise(
      supabase,
      sessionId,
      c.matched_exercise_name,
      c.raw_phrase
    );
    if (!resolved) continue;
    cardioLogged += 1;
    const patch: Record<string, unknown> = {
      completed_at: new Date().toISOString(),
    };
    if (c.duration_min != null) patch.duration_min = c.duration_min;
    if (c.distance_km != null) patch.distance_km = c.distance_km;
    if (c.intensity) patch.intensity = c.intensity;
    await supabase
      .from("workout_session_exercises")
      .update(patch)
      .eq("id", resolved.id);
  }

  // 3. Exercise comments
  for (const c of parsed.exercise_comments) {
    const resolved = await ensureSessionExercise(
      supabase,
      sessionId,
      c.matched_exercise_name,
      c.matched_exercise_name
    );
    if (!resolved) continue;
    await supabase
      .from("workout_session_exercises")
      .update({ comment: c.comment })
      .eq("id", resolved.id);
  }

  // 4. Pain intents
  const generalPain: string[] = [];
  for (const p of parsed.pain_intents) {
    if (!p.matched_exercise_name) {
      // No exercise binding — fold into session notes
      generalPain.push(p.raw_phrase);
      continue;
    }
    const resolved = await ensureSessionExercise(
      supabase,
      sessionId,
      p.matched_exercise_name,
      p.matched_exercise_name
    );
    if (!resolved) continue;

    // Upsert pain log (replace existing for this session_exercise)
    const { data: existingPain } = await supabase
      .from("exercise_pain_logs")
      .select("id")
      .eq("session_exercise_id", resolved.id)
      .maybeSingle();
    const payload = {
      user_id: userId,
      session_exercise_id: resolved.id,
      severity: p.severity,
      feel_rating: p.feel_rating,
      pain_regions: p.pain_regions.length > 0 ? p.pain_regions : null,
      notes: p.raw_phrase,
    };
    if (existingPain?.id) {
      await supabase
        .from("exercise_pain_logs")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existingPain.id);
    } else {
      await supabase.from("exercise_pain_logs").insert(payload);
    }
    painLogs += 1;
  }

  // 5. Session notes — append, don't overwrite. Capture the raw text too.
  const notesParts: string[] = [];
  if (parsed.session_notes) notesParts.push(parsed.session_notes);
  if (generalPain.length > 0) notesParts.push(`Pain mentions: ${generalPain.join("; ")}`);
  if (parsed.uncertainty_notes.length > 0) {
    notesParts.push(`Uncertain: ${parsed.uncertainty_notes.join("; ")}`);
  }
  if (notesParts.length > 0) {
    const { data: current } = await supabase
      .from("workout_sessions")
      .select("notes, free_form_text")
      .eq("id", sessionId)
      .maybeSingle();
    const currentNotes = (current?.notes as string | null) ?? null;
    const appended = currentNotes
      ? `${currentNotes}\n${notesParts.join(" · ")}`
      : notesParts.join(" · ");
    await supabase
      .from("workout_sessions")
      .update({
        notes: appended,
        free_form_text: rawText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  } else {
    await supabase
      .from("workout_sessions")
      .update({ free_form_text: rawText, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  // 6. Build summary
  const { data: sess } = await supabase
    .from("workout_sessions")
    .select("id, name")
    .eq("id", sessionId)
    .maybeSingle();
  const sessionName = (sess?.name as string | null) ?? "Session";
  const summary = formatSummary({
    sessionName,
    parsed,
    exercisesLogged,
    setsLogged,
    painLogs,
    cardioLogged,
  });

  return {
    session_id: sessionId,
    session_name: sessionName,
    exercises_logged: exercisesLogged,
    sets_logged: setsLogged,
    pain_logs: painLogs,
    cardio_logged: cardioLogged,
    summary,
  };
}

function formatSummary({
  sessionName,
  parsed,
  exercisesLogged,
  setsLogged,
  painLogs,
  cardioLogged,
}: {
  sessionName: string;
  parsed: ParsedWorkout;
  exercisesLogged: number;
  setsLogged: number;
  painLogs: number;
  cardioLogged: number;
}): string {
  const lines: string[] = [`💪 Logged to ${sessionName}`];
  for (const ex of parsed.parsed_exercises) {
    const name = ex.matched_exercise_name ?? ex.raw_phrase;
    if (ex.sets.length === 0) {
      lines.push(`• ${name}`);
      continue;
    }
    const topSet = ex.sets.reduce<typeof ex.sets[number] | null>((best, s) => {
      if (best == null) return s;
      const sw = s.weight ?? 0;
      const bw = best.weight ?? 0;
      return sw > bw ? s : best;
    }, null);
    if (topSet && topSet.weight != null) {
      lines.push(
        `• ${name}: ${ex.sets.length} sets, top ${topSet.weight}${topSet.unit ?? "kg"}${topSet.reps != null ? ` × ${topSet.reps}` : ""}`
      );
    } else if (topSet && topSet.reps != null) {
      lines.push(`• ${name}: ${ex.sets.length} sets × ${topSet.reps}`);
    } else {
      lines.push(`• ${name}: ${ex.sets.length} sets`);
    }
  }
  for (const c of parsed.cardio_entries) {
    const name = c.matched_exercise_name ?? c.raw_phrase;
    const bits: string[] = [];
    if (c.duration_min != null) bits.push(`${c.duration_min} min`);
    if (c.distance_km != null) bits.push(`${c.distance_km} km`);
    if (c.intensity) bits.push(c.intensity);
    lines.push(`• ${name}${bits.length ? `: ${bits.join(" · ")}` : ""}`);
  }
  if (painLogs > 0) {
    const top = parsed.pain_intents[0];
    if (top) {
      const emoji = top.feel_rating ? FEEL_EMOJI[top.feel_rating] : "·";
      const region =
        top.pain_regions.length > 0
          ? top.pain_regions[0].replace(/_/g, " ")
          : "unspecified";
      const sev = top.severity != null ? ` (${top.severity})` : "";
      lines.push(
        `• ${painLogs} pain note${painLogs === 1 ? "" : "s"}: ${emoji} ${region}${sev}`
      );
    } else {
      lines.push(`• ${painLogs} pain notes`);
    }
  }
  if (cardioLogged === 0 && setsLogged === 0 && exercisesLogged === 0 && painLogs === 0) {
    lines.push("• Saved as session note.");
  }
  return lines.join("\n");
}
