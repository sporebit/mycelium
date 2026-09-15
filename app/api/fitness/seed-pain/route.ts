import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { PAIN_SEED_ROWS } from "@/lib/fitness/seed-pain";

export const runtime = "nodejs";

/**
 * Idempotent seed of exercise_baselines from the user's spreadsheet.
 * Uses upsert on (space_id, exercise_name) so re-running is safe.
 */
export async function POST() {

  try {
    const supabase = await createUserClient();
    const rows = PAIN_SEED_ROWS.map((r) => ({ exercise_name: r.exercise_name,
      has_known_issues: r.has_known_issues,
      typical_severity_min: r.typical_severity_min,
      typical_severity_max: r.typical_severity_max,
      pain_regions: r.pain_regions,
      conditional_notes: r.conditional_notes,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("exercise_baselines")
      .upsert(rows, { onConflict: "space_id,exercise_name" });
    if (error) {
      console.error("[/api/fitness/seed-pain]", error);
      return NextResponse.json({ error: "seed failed" }, { status: 500 });
    }

    const flagged = PAIN_SEED_ROWS.filter((r) => r.has_known_issues === true).length;
    const uncertain = PAIN_SEED_ROWS.filter((r) => r.has_known_issues === null).length;
    return NextResponse.json({
      ok: true,
      upserted: rows.length,
      with_known_issues: flagged,
      uncertain,
    });
  } catch (err) {
    console.error("[/api/fitness/seed-pain]", err);
    return NextResponse.json({ error: "seed failed" }, { status: 500 });
  }
}
