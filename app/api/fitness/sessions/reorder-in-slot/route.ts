import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Slot } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  date?: string;
  slot?: Slot;
  session_ids?: string[];
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const date = body.date;
  const slot = body.slot;
  const ids = Array.isArray(body.session_ids) ? body.session_ids : null;
  if (!date || !slot || !ids) {
    return NextResponse.json(
      { error: "date, slot, session_ids required" },
      { status: 400 }
    );
  }
  if (!["morning", "afternoon", "evening", "extra"].includes(slot)) {
    return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Verify ownership AND that every id is in this slot for this date
    const { data: existing } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("date", date)
      .eq("slot", slot)
      .in("id", ids);
    const valid = new Set<string>(
      ((existing ?? []) as Array<{ id: string }>).map((r) => r.id)
    );
    if (ids.some((id) => !valid.has(id))) {
      return NextResponse.json(
        { error: "id list contains foreign session" },
        { status: 400 }
      );
    }

    // Two-phase: stash to negatives, then write the final positions.
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("workout_sessions")
          .update({ position: -1 - i })
          .eq("id", id)
      )
    );
    await Promise.all(
      ids.map((id, i) =>
        supabase.from("workout_sessions").update({ position: i }).eq("id", id)
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reorder-in-slot]", err);
    return NextResponse.json({ error: "reorder failed" }, { status: 500 });
  }
}
