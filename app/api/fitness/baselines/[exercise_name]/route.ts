import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { resolveExerciseNames } from "@/lib/fitness/resolve-aliases";
import type { ExerciseBaseline } from "@/lib/fitness/types";

export const runtime = "nodejs";

const BASELINE_FIELDS =
  "id, exercise_name, has_known_issues, typical_severity_min, typical_severity_max, pain_regions, conditional_notes, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ exercise_name: string }> }
) {
  const { exercise_name: raw } = await ctx.params;
  const name = decodeURIComponent(raw).trim();
  if (!name) return NextResponse.json({ baseline: null });
  try {
    const supabase = await createUserClient();
    const names = await resolveExerciseNames(supabase, name);
    const orFilter = names.map(n => `exercise_name.ilike.${n}`).join(",");
    const { data } = await supabase
      .from("exercise_baselines")
      .select(BASELINE_FIELDS)
      .or(orFilter)
      .maybeSingle();
    return NextResponse.json({
      baseline: (data ?? null) as ExerciseBaseline | null,
    });
  } catch (err) {
    console.error("[/api/fitness/baselines/:name GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
