import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { BodyMetric, WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

const FIELDS =
  "id, user_id, date, weight, weight_unit, body_fat_pct, muscle_mass_kg, waist_in, arms_in, thorax_in, thighs_in, notes, created_at";

const VALID_UNITS: WeightUnit[] = ["kg", "lbs", "stone"];

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const rawDays = new URL(req.url).searchParams.get("days") ?? "90";
  const days = rawDays === "0" ? 0 : Math.max(1, parseInt(rawDays, 10) || 90);

  try {
    const today = localDateKey();
    const supabase = createServerClient();
    let query = supabase
      .from("body_metrics")
      .select(FIELDS)
      .eq("user_id", uid)
      .lte("date", today)
      .order("date", { ascending: false });

    if (days > 0) {
      let earliest = today;
      for (let i = 0; i < days - 1; i++) earliest = previousDateKey(earliest);
      query = query.gte("date", earliest);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ entries: (data ?? []) as BodyMetric[] });
  } catch (err) {
    console.error("[/api/body-metrics GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
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
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("body_metrics")
      .upsert(
        {
          user_id: uid,
          date,
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
        { onConflict: "user_id,date" }
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
