import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TaskRow = {
  id: string;
  title: string;
  time_estimate_min: number | null;
  entity_id: string | null;
  entities: { name: string } | { name: string }[] | null;
};

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, time_estimate_min, entity_id, entities(name)")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .eq("urgency", "today")
      .eq("key", true)
      .is("completed_at", null)
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(3);

    if (error) throw error;

    const tasks = ((data as TaskRow[] | null) ?? []).map((r) => {
      const ent = Array.isArray(r.entities) ? r.entities[0] : r.entities;
      return {
        id: r.id,
        title: r.title,
        timeEstimateMin: r.time_estimate_min,
        entityName: ent?.name ?? null,
      };
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[tasks/top-today GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
