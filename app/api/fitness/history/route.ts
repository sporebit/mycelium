import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { toKg } from "@/lib/fitness/units";
import type {
  HistoryResponse,
  HistorySessionCard,
  LoggedSet,
  SessionKind,
  Slot,
  WeightUnit,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const params = req.nextUrl.searchParams;
  const cursor = params.get("cursor");
  const kind = params.get("kind") as SessionKind | null;
  const sessionType = params.get("session_type");
  const limitParam = Number(params.get("limit") ?? LIMIT_DEFAULT);
  const limit = Math.min(LIMIT_MAX, Math.max(1, Number.isFinite(limitParam) ? limitParam : LIMIT_DEFAULT));

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("workout_sessions")
      .select(
        "id, date, slot, kind, session_type, name, notes, started_at, completed_at, created_at"
      )
      .eq("user_id", uid)
      .not("completed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (
      kind &&
      ["cardio", "conditioning", "resistance", "mobility", "other"].includes(kind)
    ) {
      q = q.eq("kind", kind);
    }
    if (sessionType) {
      q = q.eq("session_type", sessionType);
    }
    if (cursor) {
      q = q.lt("created_at", cursor);
    }

    const { data: rows, error } = await q;
    if (error) {
      console.error("[/api/fitness/history GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    type SessionRow = {
      id: string;
      date: string;
      slot: string;
      kind: string;
      session_type: string | null;
      name: string | null;
      notes: string | null;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
    };
    const sessionRows = (rows ?? []) as SessionRow[];

    const hasMore = sessionRows.length > limit;
    const page = hasMore ? sessionRows.slice(0, limit) : sessionRows;
    const nextCursor = hasMore
      ? sessionRows[limit - 1]?.created_at ?? null
      : null;

    let cards: HistorySessionCard[] = [];
    if (page.length > 0) {
      const sessionIds = page.map((r) => r.id);
      // Pull all exercises + sets in two batched queries
      const { data: exRows } = await supabase
        .from("workout_session_exercises")
        .select(
          "id, session_id, duration_min, distance_km, intensity, skipped"
        )
        .in("session_id", sessionIds);
      type ExRow = {
        id: string;
        session_id: string;
        duration_min: number | null;
        distance_km: number | null;
        intensity: string | null;
        skipped: boolean;
      };
      const exs = (exRows ?? []) as ExRow[];
      const exIds = exs.map((e) => e.id);

      const { data: setRows } = exIds.length
        ? await supabase
            .from("workout_sets")
            .select("session_exercise_id, set_number, reps, weight, unit, completed_at")
            .in("session_exercise_id", exIds)
        : { data: [] as unknown as Array<LoggedSet & { session_exercise_id: string }> };
      type SetRow = LoggedSet & { session_exercise_id: string };
      const sets = (setRows ?? []) as unknown as SetRow[];

      // Group exercises by session
      const exBySession = new Map<string, ExRow[]>();
      for (const e of exs) {
        const list = exBySession.get(e.session_id) ?? [];
        list.push(e);
        exBySession.set(e.session_id, list);
      }
      // Group sets by exercise
      const setsByEx = new Map<string, SetRow[]>();
      for (const s of sets) {
        const list = setsByEx.get(s.session_exercise_id) ?? [];
        list.push(s);
        setsByEx.set(s.session_exercise_id, list);
      }

      cards = page.map((s) => {
        const exsForSession = exBySession.get(s.id) ?? [];
        const exerciseCount = exsForSession.filter((e) => !e.skipped).length;
        let setCount = 0;
        let totalVolKg = 0;
        let distanceKm = 0;
        let durationActiveMin = 0;
        for (const e of exsForSession) {
          if (e.skipped) continue;
          if (e.distance_km != null) distanceKm += Number(e.distance_km);
          if (e.duration_min != null) durationActiveMin += Number(e.duration_min);
          const exSets = setsByEx.get(e.id) ?? [];
          for (const set of exSets) {
            if (!set.completed_at) continue;
            setCount++;
            if (set.weight != null && set.reps != null) {
              const unit = (set.unit ?? "kg") as WeightUnit;
              totalVolKg += toKg(set.weight, unit) * set.reps;
            }
          }
        }
        let durationMinutes: number | null = null;
        if (s.started_at && s.completed_at) {
          const ms =
            new Date(s.completed_at).getTime() -
            new Date(s.started_at).getTime();
          durationMinutes = Math.max(0, Math.round(ms / 60000));
        }
        return {
          id: s.id,
          date: s.date,
          slot: s.slot as Slot,
          kind: s.kind as SessionKind,
          session_type: s.session_type,
          name: s.name,
          started_at: s.started_at,
          completed_at: s.completed_at,
          notes: s.notes,
          exercise_count: exerciseCount,
          set_count: setCount,
          total_volume_kg: Math.round(totalVolKg),
          duration_minutes: durationMinutes,
          distance_km: distanceKm > 0 ? Number(distanceKm.toFixed(2)) : 0,
          duration_active_min: Math.round(durationActiveMin),
        };
      });
    }

    // Only include the user-wide type-count map on the first page.
    let typeCounts: Record<string, number> | undefined;
    if (!cursor) {
      const { data: allTypeRows } = await supabase
        .from("workout_sessions")
        .select("session_type")
        .eq("user_id", uid)
        .not("completed_at", "is", null);
      typeCounts = {};
      for (const r of (allTypeRows ?? []) as Array<{ session_type: string | null }>) {
        if (!r.session_type) continue;
        typeCounts[r.session_type] = (typeCounts[r.session_type] ?? 0) + 1;
      }
    }

    const out: HistoryResponse = {
      sessions: cards,
      next_cursor: nextCursor,
      ...(typeCounts ? { type_counts: typeCounts } : {}),
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/history GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
