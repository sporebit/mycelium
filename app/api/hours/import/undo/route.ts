import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** POST — undo the latest import that has not been undone (hours_undo_import, 0156). */
export async function POST() {
  try {
    const supabase = await createUserClient();
    const { data: latest, error: e1 } = await supabase
      .from("hours_import_runs")
      .select("id, undone_at")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;
    if (!latest || latest.undone_at) return NextResponse.json({ error: "Nothing to undo." }, { status: 409 });
    const { data, error } = await supabase.rpc("hours_undo_import", { p_run: latest.id });
    if (error) throw error;
    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    console.error("[/api/hours/import/undo POST]", err);
    return NextResponse.json({ error: "undo failed" }, { status: 500 });
  }
}
