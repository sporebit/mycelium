import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { ExerciseBaseline } from "@/lib/fitness/types";

export const runtime = "nodejs";

const BASELINE_FIELDS =
  "id, exercise_name, has_known_issues, typical_severity_min, typical_severity_max, pain_regions, conditional_notes, created_at, updated_at";

export async function GET(req: NextRequest) {
  const onlyIssues = req.nextUrl.searchParams.get("has_known_issues") === "true";
  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("exercise_baselines")
      .select(BASELINE_FIELDS)
      .order("exercise_name", { ascending: true });
    if (onlyIssues) q = q.eq("has_known_issues", true);
    const { data, error } = await q;
    if (error) {
      console.error("[/api/fitness/baselines GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    return NextResponse.json({ baselines: (data ?? []) as ExerciseBaseline[] });
  } catch (err) {
    console.error("[/api/fitness/baselines GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
