import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveExerciseNames } from "@/lib/fitness/resolve-aliases";
import {
  exerciseHistorySummary,
  findPRs,
  modalUnit,
  type RawExerciseSessionRow,
} from "@/lib/fitness/aggregates";
import type {
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  LoggedSet,
  WeightUnit,
} from "@/lib/fitness/types";

export const runtime = "nodejs";
const MAX_SESSIONS = 100;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const names = await resolveExerciseNames(supabase, uid, name);
    const canonical = names[0];
    const orFilter = names.map(n => `name.ilike.${n}`).join(",");

    const { data: exRows, error: exErr } = await supabase
      .from("workout_session_exercises")
      .select(
        "id, session_id, comment, notes, is_bodyweight, workout_sessions:session_id!inner(id, date, slot, user_id, completed_at)"
      )
      .or(orFilter)
      .eq("skipped", false)
      .limit(MAX_SESSIONS * 2);
    if (exErr) {
      console.error("[/api/fitness/exercise-history] ex fetch", exErr);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    type ExRow = {
      id: string;
      session_id: string;
      comment: string | null;
      notes: string | null;
      is_bodyweight?: boolean | null;
      workout_sessions:
        | { id: string; date: string; slot: string; user_id: string; completed_at: string | null }
        | { id: string; date: string; slot: string; user_id: string; completed_at: string | null }[];
    };

    const candidates: Array<{
      ex_id: string;
      session_id: string;
      date: string;
      slot: string;
      comment: string | null;
      notes: string | null;
      is_bodyweight: boolean;
    }> = [];
    for (const r of (exRows ?? []) as ExRow[]) {
      const sess = Array.isArray(r.workout_sessions)
        ? r.workout_sessions[0]
        : r.workout_sessions;
      if (!sess) continue;
      if (sess.user_id !== uid) continue;
      if (!sess.completed_at) continue;
      candidates.push({
        ex_id: r.id,
        session_id: sess.id,
        date: sess.date,
        slot: sess.slot,
        comment: r.comment,
        notes: r.notes,
        is_bodyweight: r.is_bodyweight === true,
      });
    }
    candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const top = candidates.slice(0, MAX_SESSIONS);

    // 2) Template notes — first non-null notes field from any
    //    workout_programme_exercises with this name.
    const tplOrFilter = names.map(n => `name.ilike.${n}`).join(",");
    const { data: tplRows } = await supabase
      .from("workout_programme_exercises")
      .select("notes")
      .or(tplOrFilter)
      .not("notes", "is", null)
      .limit(1);
    const templateNotes =
      ((tplRows ?? [])[0]?.notes as string | null | undefined) ?? null;

    if (top.length === 0) {
      const empty: ExerciseHistoryResponse = {
        exercise_name: canonical,
        template_notes: templateNotes,
        modal_unit: "kg",
        sessions: [],
        peak_weight: null,
        volume_pr: null,
        is_bodyweight: false,
      };
      return NextResponse.json(empty);
    }

    // 3) Pull sets for those session_exercises
    const exIds = top.map((c) => c.ex_id);
    const { data: setRows, error: setErr } = await supabase
      .from("workout_sets")
      .select("session_exercise_id, set_number, reps, weight, unit, completed_at")
      .in("session_exercise_id", exIds);
    if (setErr) {
      console.error("[/api/fitness/exercise-history] sets fetch", setErr);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    type SetRow = LoggedSet & { session_exercise_id: string };
    const setsByEx = new Map<string, LoggedSet[]>();
    for (const r of (setRows ?? []) as unknown as SetRow[]) {
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

    // 4) Build raw rows for the aggregator
    const raw: RawExerciseSessionRow[] = top.map((c) => ({
      session_exercise_id: c.ex_id,
      session_id: c.session_id,
      date: c.date,
      slot: c.slot,
      comment: c.comment,
      notes: c.notes,
      sets: setsByEx.get(c.ex_id) ?? [],
    }));
    const summary = exerciseHistorySummary(raw);
    const { peak, volume } = findPRs(summary);
    const flagged: ExerciseHistoryEntry[] = summary.map((s) => ({
      ...s,
      is_peak_weight_pr: peak !== null && s.session_id === peak.session_id,
      is_volume_pr: volume !== null && s.session_id === volume.session_id,
    }));
    const mu: WeightUnit = modalUnit(flagged);

    // Any recent session marked bodyweight is enough to flip the
    // chart label to "added weight" — once it's BW, future sessions
    // logging "BW + N" all share the same axis semantics.
    const isBodyweight = candidates.some((c) => c.is_bodyweight);

    const out: ExerciseHistoryResponse = {
      exercise_name: canonical,
      template_notes: templateNotes,
      modal_unit: mu,
      sessions: flagged,
      peak_weight: peak,
      volume_pr: volume,
      is_bodyweight: isBodyweight,
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/exercise-history]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
