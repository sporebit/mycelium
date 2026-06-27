import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Apple Health → Myphelium2 webhook for body metrics. Designed for the
 * iOS Shortcut that reads the latest weight + body composition values
 * from HealthKit and POSTs them here on a schedule.
 *
 * Auth: middleware accepts X-API-Secret. Same secret as the capture
 * Shortcut uses.
 *
 * Body:
 *   {
 *     weight_kg: number,
 *     body_fat_percent?: number,
 *     muscle_mass_kg?: number,
 *     bone_mass_kg?: number,
 *     water_percent?: number,
 *     recorded_at: ISO string,
 *     source: 'apple_health' | 'manual' | 'scale_ble'
 *   }
 */
export const runtime = "nodejs";

type Body = {
  weight_kg?: number;
  body_fat_percent?: number;
  muscle_mass_kg?: number;
  bone_mass_kg?: number;
  water_percent?: number;
  recorded_at?: string;
  source?: "apple_health" | "manual" | "scale_ble";
};

const ALLOWED_SOURCES = new Set(["apple_health", "manual", "scale_ble"]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("invalid recorded_at");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (typeof body.weight_kg !== "number" || !Number.isFinite(body.weight_kg)) {
    return NextResponse.json(
      { error: "weight_kg required (number)" },
      { status: 400 },
    );
  }
  if (!body.recorded_at) {
    return NextResponse.json(
      { error: "recorded_at required (ISO string)" },
      { status: 400 },
    );
  }
  const source = body.source ?? "manual";
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json(
      { error: "source must be one of apple_health|manual|scale_ble" },
      { status: 400 },
    );
  }

  let date: string;
  try {
    date = dateKey(body.recorded_at);
  } catch {
    return NextResponse.json(
      { error: "recorded_at not a valid date" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("body_metrics")
      .upsert(
        {
          user_id: uid,
          date,
          weight: body.weight_kg,
          weight_unit: "kg",
          body_fat_pct: body.body_fat_percent ?? null,
          muscle_mass_kg: body.muscle_mass_kg ?? null,
          bone_mass_kg: body.bone_mass_kg ?? null,
          water_percent: body.water_percent ?? null,
          source,
          recorded_at: body.recorded_at,
        },
        { onConflict: "user_id,date" },
      )
      .select("id, weight, body_fat_pct, source, recorded_at")
      .single();

    if (error || !data) {
      throw error ?? new Error("upsert returned no row");
    }

    const fatPart =
      data.body_fat_pct !== null && data.body_fat_pct !== undefined
        ? ` (${Number(data.body_fat_pct).toFixed(1)}% body fat)`
        : "";
    return NextResponse.json({
      ok: true,
      entry: data,
      summary: `⚖️ Weight logged — ${Number(data.weight).toFixed(1)} kg${fatPart}`,
    });
  } catch (err) {
    console.error("[/api/health/body-metrics POST]", err);
    return NextResponse.json(
      { error: "save failed" },
      { status: 500 },
    );
  }
}
