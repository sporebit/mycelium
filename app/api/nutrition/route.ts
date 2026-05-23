import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseNotes } from "@/lib/dailyLog";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { sumMeals, type Meal } from "@/lib/types/nutrition";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = Math.min(
    365,
    Math.max(1, daysParam ? parseInt(daysParam, 10) || 30 : 30)
  );

  try {
    const today = localDateKey();
    let earliest = today;
    for (let i = 0; i < days - 1; i++) earliest = previousDateKey(earliest);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("daily_logs")
      .select("log_date, notes")
      .eq("user_id", uid)
      .gte("log_date", earliest)
      .lte("log_date", today)
      .order("log_date", { ascending: false });

    if (error) throw error;

    type Row = { log_date: string; notes: string | null };
    const byDate = new Map<string, Row>();
    for (const r of (data ?? []) as Row[]) byDate.set(r.log_date, r);

    const result: Array<{
      date: string;
      total_kcal: number;
      total_p: number;
      total_c: number;
      total_f: number;
      meal_count: number;
      meals: Meal[];
      empty: boolean;
    }> = [];

    let cursor = today;
    for (let i = 0; i < days; i++) {
      const row = byDate.get(cursor);
      const notes = parseNotes(row?.notes ?? null);
      const nutrition = (notes as { nutrition?: { meals?: unknown } }).nutrition;
      const meals: Meal[] = Array.isArray(nutrition?.meals)
        ? (nutrition!.meals as Meal[]).filter(
            (m): m is Meal =>
              !!m &&
              typeof m === "object" &&
              typeof (m as Meal).id === "string"
          )
        : [];
      const totals = sumMeals(meals);
      result.push({
        date: cursor,
        total_kcal: totals.kcal,
        total_p: totals.p,
        total_c: totals.c,
        total_f: totals.f,
        meal_count: meals.length,
        meals,
        empty: meals.length === 0,
      });
      cursor = previousDateKey(cursor);
    }

    return NextResponse.json({ days: result });
  } catch (err) {
    console.error("[/api/nutrition GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
