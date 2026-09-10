import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { BodyMetric, WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

const FIELDS =
  "id, date, weight, weight_unit, body_fat_pct, muscle_mass_kg, waist_in, notes, created_at";

const VALID_UNITS: WeightUnit[] = ["kg", "lbs", "stone"];

function validDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ date: string }> }
) {
  const { date } = await ctx.params;
  if (!validDate(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  let body: Partial<BodyMetric>;
  try {
    body = (await req.json()) as Partial<BodyMetric>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const unit = (body.weight_unit ?? "kg") as WeightUnit;
  if (!VALID_UNITS.includes(unit)) {
    return NextResponse.json({ error: "weight_unit must be kg|lbs|stone" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("body_metrics")
      .upsert(
        { date,
          weight: body.weight ?? null,
          weight_unit: unit,
          body_fat_pct: body.body_fat_pct ?? null,
          muscle_mass_kg: body.muscle_mass_kg ?? null,
          waist_in: body.waist_in ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "space_id,date" }
      )
      .select(FIELDS)
      .single();
    if (error || !data) throw error ?? new Error("upsert failed");
    return NextResponse.json({ entry: data as BodyMetric });
  } catch (err) {
    console.error("[/api/body-metrics/:date PATCH]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ date: string }> }
) {
  const { date } = await ctx.params;
  if (!validDate(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("body_metrics")
      .delete()
      .eq("date", date);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/body-metrics/:date DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
