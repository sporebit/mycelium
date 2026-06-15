import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { TemplateSession } from "@/lib/fitness/types";

export const runtime = "nodejs";

const SESSION_FIELDS = "id, programme_id, day_of_week, slot, kind, name, notes";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function userOwnsProgramme(
  programmeId: string,
  uid: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("workout_programmes")
    .select("id")
    .eq("id", programmeId)
    .eq("user_id", uid)
    .maybeSingle();
  return !!data;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: programmeId } = await ctx.params;
  if (!(await userOwnsProgramme(programmeId, uid))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const VALID_SLOTS = new Set(["morning", "afternoon", "evening", "extra"]);
  const VALID_KINDS = new Set(["cardio", "conditioning", "resistance", "mobility"]);

  let body: {
    day_of_week?: number;
    slot?: string;
    kind?: string;
    name?: string;
    notes?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (
    typeof body.day_of_week !== "number" ||
    body.day_of_week < 0 ||
    body.day_of_week > 6 ||
    !VALID_SLOTS.has(body.slot ?? "") ||
    !VALID_KINDS.has(body.kind ?? "") ||
    !body.name?.trim()
  ) {
    return NextResponse.json(
      { error: "day_of_week (0-6), slot (morning|afternoon|evening|extra), kind (cardio|conditioning|resistance|mobility), name required" },
      { status: 400 }
    );
  }

  try {
    const upsertPayload = {
      programme_id: programmeId,
      day_of_week: body.day_of_week,
      slot: body.slot,
      kind: body.kind,
      name: body.name.trim(),
      notes: body.notes ?? null,
    };
    console.log("[sessions POST] upsert payload:", JSON.stringify(upsertPayload));

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programme_sessions")
      .upsert(upsertPayload, { onConflict: "programme_id,day_of_week,slot" })
      .select(SESSION_FIELDS)
      .single();

    if (error) {
      console.error("[sessions POST] supabase error:", JSON.stringify({
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }));
      throw error;
    }
    if (!data) throw new Error("upsert returned no data");
    return NextResponse.json({ session: data as TemplateSession });
  } catch (err) {
    console.error("[sessions POST] catch:", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
