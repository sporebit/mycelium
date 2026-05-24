import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export type PersonRow = {
  id: string;
  name: string;
  kind: string | null;
  task_count: number;
  open_task_count: number;
  last_interaction: string | null;
};

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const [entitiesRes, tasksRes] = await Promise.all([
      supabase
        .from("entities")
        .select("id, name, kind")
        .eq("user_id", uid)
        .eq("kind", "person"),
      supabase
        .from("tasks")
        .select("id, entity_id, created_at, completed_at")
        .eq("user_id", uid)
        .not("entity_id", "is", null),
    ]);

    if (entitiesRes.error) throw entitiesRes.error;
    if (tasksRes.error) throw tasksRes.error;

    type Stat = {
      taskCount: number;
      openCount: number;
      lastInteraction: string | null;
    };
    const stats = new Map<string, Stat>();
    for (const t of (tasksRes.data ?? []) as Array<{
      entity_id: string;
      created_at: string;
      completed_at: string | null;
    }>) {
      const s = stats.get(t.entity_id) ?? {
        taskCount: 0,
        openCount: 0,
        lastInteraction: null,
      };
      s.taskCount++;
      if (!t.completed_at) s.openCount++;
      if (!s.lastInteraction || t.created_at > s.lastInteraction) {
        s.lastInteraction = t.created_at;
      }
      stats.set(t.entity_id, s);
    }

    const people: PersonRow[] = (entitiesRes.data ?? []).map((e) => {
      const s = stats.get(e.id);
      return {
        id: e.id,
        name: e.name,
        kind: e.kind,
        task_count: s?.taskCount ?? 0,
        open_task_count: s?.openCount ?? 0,
        last_interaction: s?.lastInteraction ?? null,
      };
    });

    // Sort: most recent interaction first, nulls last; tie-break by name.
    people.sort((a, b) => {
      if (a.last_interaction && b.last_interaction) {
        return b.last_interaction.localeCompare(a.last_interaction);
      }
      if (a.last_interaction) return -1;
      if (b.last_interaction) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ people });
  } catch (err) {
    console.error("[/api/people GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
