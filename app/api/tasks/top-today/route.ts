import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";

export const runtime = "nodejs";

type TaskRow = {
  id: string;
  title: string;
  time_estimate_min: number | null;
  entity_id: string | null;
  entities: { name: string } | { name: string }[] | null;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("tickets")
      .select("id, title, time_estimate_min, entity_id, space_id, entities(name)")
      .is("deleted_at", null)
      .eq("urgency", "today")
      .eq("key", true)
      .is("completed_at", null)
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(3);

    if (error) throw error;
    auditListRead(req, data, "organisation", "tasks");

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
