import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { NutritionLog } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = Math.min(
    365,
    Math.max(1, daysParam ? parseInt(daysParam, 10) || 30 : 30),
  );
  try {
    const today = localDateKey();
    let earliest = today;
    for (let i = 0; i < days - 1; i++) earliest = previousDateKey(earliest);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("date, food_name, kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", uid)
      .gte("date", earliest)
      .lte("date", today)
      .order("date", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Pick<
      NutritionLog,
      "date" | "food_name" | "kcal" | "protein_g" | "carbs_g" | "fat_g"
    >[];

    type DayAgg = {
      date: string;
      total_kcal: number;
      total_p: number;
      total_c: number;
      total_f: number;
      log_count: number;
      empty: boolean;
    };
    const byDate = new Map<string, DayAgg>();
    const foodCounts = new Map<string, number>();
    for (const r of rows) {
      const d = byDate.get(r.date) ?? {
        date: r.date,
        total_kcal: 0,
        total_p: 0,
        total_c: 0,
        total_f: 0,
        log_count: 0,
        empty: false,
      };
      d.total_kcal += r.kcal ?? 0;
      d.total_p += r.protein_g ?? 0;
      d.total_c += r.carbs_g ?? 0;
      d.total_f += r.fat_g ?? 0;
      d.log_count += 1;
      byDate.set(r.date, d);
      foodCounts.set(r.food_name, (foodCounts.get(r.food_name) ?? 0) + 1);
    }

    const result: DayAgg[] = [];
    let cursor = today;
    for (let i = 0; i < days; i++) {
      const existing = byDate.get(cursor);
      result.push(
        existing ?? {
          date: cursor,
          total_kcal: 0,
          total_p: 0,
          total_c: 0,
          total_f: 0,
          log_count: 0,
          empty: true,
        },
      );
      cursor = previousDateKey(cursor);
    }

    // Streak: count consecutive days from today with any logs
    let streak = 0;
    for (const d of result) {
      if (d.log_count > 0) streak += 1;
      else break;
    }

    const nonEmpty = result.filter((d) => !d.empty);
    const avg =
      nonEmpty.length > 0
        ? Math.round(
            nonEmpty.reduce((s, d) => s + d.total_kcal, 0) / nonEmpty.length,
          )
        : 0;

    const topFoods = [...foodCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      days: result,
      streak,
      avg_kcal: avg,
      top_foods: topFoods,
    });
  } catch (err) {
    console.error("[/api/nutrition/history GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
