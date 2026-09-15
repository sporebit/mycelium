import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { BodyMetric, WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

const FIELDS =
  "id, date, weight, weight_unit, body_fat_pct, muscle_mass_kg, waist_in, arms_in, thorax_in, thighs_in, notes, created_at";

const VALID_UNITS: WeightUnit[] = ["kg", "lbs", "stone"];

export async function GET(req: NextRequest) {
  const rawDays = new URL(req.url).searchParams.get("days") ?? "90";
  const days = rawDays === "0" ? 0 : Math.max(1, parseInt(rawDays, 10) || 90);

  try {
    const today = localDateKey();
    const supabase = await createUserClient();
    let query = supabase
      .from("body_metrics")
      .select(`${FIELDS}, space_id`)
      .lte("date", today)
      .order("date", { ascending: false });

    if (days > 0) {
      let earliest = today;
      for (let i = 0; i < days - 1; i++) earliest = previousDateKey(earliest);
      query = query.gte("date", earliest);
    }

    const { data, error } = await query;
    if (error) throw error;
    auditListRead(req, data, "fitness", "body");
    return NextResponse.json({ entries: (data ?? []) as unknown as BodyMetric[] });
  } catch (err) {
    console.error("[/api/body-metrics GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<BodyMetric> & { date?: string };
  try {
    body = (await req.json()) as Partial<BodyMetric>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const date = body.date ?? localDateKey();
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
          arms_in: body.arms_in ?? null,
          thorax_in: body.thorax_in ?? null,
          thighs_in: body.thighs_in ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "space_id,date" }
      )
      .select(FIELDS)
      .single();
    if (error || !data) throw error ?? new Error("upsert failed");
    return NextResponse.json({ entry: data as BodyMetric });
  } catch (err) {
    console.error("[/api/body-metrics POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
