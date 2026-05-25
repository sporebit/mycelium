import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ExerciseBaseline } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const BASELINE_FIELDS =
  "id, user_id, exercise_name, has_known_issues, typical_severity_min, typical_severity_max, pain_regions, conditional_notes, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ exercise_name: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { exercise_name: raw } = await ctx.params;
  const name = decodeURIComponent(raw).trim();
  if (!name) return NextResponse.json({ baseline: null });
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("exercise_baselines")
      .select(BASELINE_FIELDS)
      .eq("user_id", uid)
      .ilike("exercise_name", name)
      .maybeSingle();
    return NextResponse.json({
      baseline: (data ?? null) as ExerciseBaseline | null,
    });
  } catch (err) {
    console.error("[/api/fitness/baselines/:name GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
