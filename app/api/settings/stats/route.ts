import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TABLES = [
  { key: "tasks", table: "tasks", label: "Tasks" },
  { key: "workout_sessions", table: "workout_sessions", label: "Workout sessions" },
  { key: "nutrition_logs", table: "nutrition_logs", label: "Nutrition logs" },
  { key: "transactions", table: "bank_transactions", label: "Transactions" },
  { key: "recipes", table: "recipes", label: "Recipes" },
  { key: "investments", table: "investments", label: "Investments" },
  { key: "ventures", table: "ventures", label: "Ventures" },
] as const;

export async function GET() {
  try {
    const supabase = createServerClient();
    const stats: Record<string, { label: string; count: number }> = {};

    await Promise.all(
      TABLES.map(async ({ key, table, label }) => {
        try {
          const { count } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true });
          stats[key] = { label, count: count ?? 0 };
        } catch {
          stats[key] = { label, count: 0 };
        }
      }),
    );

    return NextResponse.json({ stats });
  } catch (err) {
    console.error("[settings/stats GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
