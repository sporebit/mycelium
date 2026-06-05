import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function toLondonDate(isoOrTs: string): string {
  const d = new Date(isoOrTs);
  const london = d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return london; // YYYY-MM-DD
}

type MetricEntry = {
  type?: string;
  metric_type?: string;
  value: number;
  unit?: string;
  date?: string;
  recorded_at?: string;
  source?: string;
};

type WorkoutEntry = {
  type?: string;
  workout_type?: string;
  start_at?: string;
  start?: string;
  end_at?: string;
  end?: string;
  duration_min?: number;
  duration?: number;
  distance_km?: number;
  distance?: number;
  energy_kcal?: number;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  source?: string;
};

type ImportPayload = {
  metrics?: MetricEntry[];
  workouts?: WorkoutEntry[];
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env.HEALTH_IMPORT_SECRET;
  if (!secret || bearer !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ImportPayload;
  try {
    body = (await req.json()) as ImportPayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const supabase = createServerClient();
  let metricsUpserted = 0;
  let workoutsUpserted = 0;

  if (body.metrics && Array.isArray(body.metrics)) {
    const rows = body.metrics
      .filter((m) => (m.type || m.metric_type) && m.value != null)
      .map((m) => {
        const recordedAt = m.recorded_at || m.date || new Date().toISOString();
        return {
          user_id: uid,
          metric_type: (m.type || m.metric_type)!,
          value: m.value,
          unit: m.unit || "count",
          date: m.date || toLondonDate(recordedAt),
          source: m.source || "apple_health",
          recorded_at: recordedAt,
        };
      });

    if (rows.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("health_metrics")
          .upsert(batch, {
            onConflict: "user_id,metric_type,date,source",
            ignoreDuplicates: false,
          });
        if (error) {
          console.error("[health-import metrics]", error);
        } else {
          metricsUpserted += batch.length;
        }
      }
    }
  }

  if (body.workouts && Array.isArray(body.workouts)) {
    const rows = body.workouts
      .filter((w) => (w.type || w.workout_type) && (w.start_at || w.start))
      .map((w) => {
        const startAt = (w.start_at || w.start)!;
        return {
          user_id: uid,
          workout_type: (w.type || w.workout_type)!,
          start_at: startAt,
          end_at: w.end_at || w.end || null,
          duration_min: w.duration_min ?? w.duration ?? null,
          distance_km: w.distance_km ?? w.distance ?? null,
          energy_kcal: w.energy_kcal ?? w.calories ?? null,
          avg_hr: w.avg_hr ?? null,
          max_hr: w.max_hr ?? null,
          source: w.source || "apple_health",
          date: toLondonDate(startAt),
        };
      });

    if (rows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("health_workouts")
          .upsert(batch, {
            onConflict: "user_id,workout_type,start_at",
            ignoreDuplicates: false,
          });
        if (error) {
          console.error("[health-import workouts]", error);
        } else {
          workoutsUpserted += batch.length;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    metrics_upserted: metricsUpserted,
    workouts_upserted: workoutsUpserted,
  });
}

export async function GET() {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("health_metrics")
      .select("created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      last_synced: data?.created_at ?? null,
    });
  } catch (err) {
    console.error("[health-import GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
