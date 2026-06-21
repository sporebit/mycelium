import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SectionDef = {
  key: string;
  tables: { table: string; label: string; dateCol?: string }[];
};

const SECTION_DEFS: SectionDef[] = [
  {
    key: "organisation",
    tables: [
      { table: "tasks", label: "Tasks", dateCol: "created_at" },
      { table: "compost_items", label: "Captures", dateCol: "created_at" },
      { table: "people", label: "People", dateCol: "created_at" },
    ],
  },
  {
    key: "fitness",
    tables: [
      { table: "workout_sessions", label: "Workout sessions", dateCol: "date" },
      { table: "exercises", label: "Exercises" },
    ],
  },
  {
    key: "health",
    tables: [
      { table: "nutrition_logs", label: "Nutrition logs", dateCol: "logged_at" },
      { table: "body_metrics", label: "Body metrics", dateCol: "measured_at" },
      { table: "recipes", label: "Recipes" },
    ],
  },
  {
    key: "finance",
    tables: [
      { table: "bank_transactions", label: "Transactions", dateCol: "date" },
      { table: "accounts", label: "Accounts" },
      { table: "investments", label: "Investments" },
    ],
  },
  {
    key: "studio",
    tables: [
      { table: "spotify_plays", label: "Spotify plays", dateCol: "played_at" },
    ],
  },
  {
    key: "ventures",
    tables: [
      { table: "ventures", label: "Ventures" },
      { table: "venture_steps", label: "Venture steps" },
      { table: "venture_ads", label: "Venture ads" },
      { table: "venture_inspiration", label: "Inspiration" },
    ],
  },
  {
    key: "the-boys",
    tables: [
      { table: "agent_conversations", label: "Conversations" },
      { table: "agent_memory", label: "Agent memory" },
    ],
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sections = (body.sections ?? []) as string[];
    const from = body.dateRange?.from as string | undefined;
    const to = body.dateRange?.to as string | undefined;

    const supabase = createServerClient();
    const counts: Record<string, { label: string; count: number }[]> = {};

    for (const def of SECTION_DEFS) {
      if (!sections.includes(def.key)) continue;
      counts[def.key] = [];
      for (const t of def.tables) {
        let q = supabase.from(t.table).select("id", { count: "exact", head: true });
        if (from && t.dateCol) q = q.gte(t.dateCol, from);
        if (to && t.dateCol) q = q.lte(t.dateCol, to);
        try {
          const { count } = await q;
          counts[def.key].push({ label: t.label, count: count ?? 0 });
        } catch {
          counts[def.key].push({ label: t.label, count: 0 });
        }
      }
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[export/preview POST]", err);
    return NextResponse.json({ error: "preview failed" }, { status: 500 });
  }
}
