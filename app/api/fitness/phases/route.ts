import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ProgrammePhase } from "@/lib/fitness/types";
import { parseIsoWeek } from "@/lib/util/week";

export const runtime = "nodejs";

const PHASE_FIELDS =
  "id, user_id, programme_id, start_week_iso, end_week_iso, created_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function validIsoWeek(s: unknown): s is string {
  return typeof s === "string" && parseIsoWeek(s) !== null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programme_phases")
      .select(PHASE_FIELDS)
      .eq("user_id", uid)
      .order("start_week_iso", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ phases: (data ?? []) as ProgrammePhase[] });
  } catch (err) {
    console.error("[/api/fitness/phases GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: { programme_id?: string; start_week_iso?: string; end_week_iso?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.programme_id || typeof body.programme_id !== "string") {
    return NextResponse.json({ error: "programme_id required" }, { status: 400 });
  }
  if (!validIsoWeek(body.start_week_iso)) {
    return NextResponse.json({ error: "start_week_iso must be YYYY-Www" }, { status: 400 });
  }
  if (
    body.end_week_iso !== null &&
    body.end_week_iso !== undefined &&
    !validIsoWeek(body.end_week_iso)
  ) {
    return NextResponse.json({ error: "end_week_iso must be YYYY-Www or null" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    // Verify programme belongs to user
    const { data: programme } = await supabase
      .from("workout_programmes")
      .select("id")
      .eq("id", body.programme_id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!programme) return NextResponse.json({ error: "programme not found" }, { status: 400 });

    const { data, error } = await supabase
      .from("workout_programme_phases")
      .insert({
        user_id: uid,
        programme_id: body.programme_id,
        start_week_iso: body.start_week_iso,
        end_week_iso: body.end_week_iso ?? null,
      })
      .select(PHASE_FIELDS)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ phase: data as ProgrammePhase });
  } catch (err) {
    console.error("[/api/fitness/phases POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
