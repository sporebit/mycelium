import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { removeGoogleEvent } from "@/lib/google/sync";
import { londonNow } from "@/lib/tickets/categories";
import { spawnAfterCompletion } from "@/lib/tickets/spawn";
import {
  fetchTicketByKey,
  moveTicket,
  principalUid,
  readJson,
  resolveTicketRef,
  ticketWriteGate,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * POST /api/tickets/[key]/complete  { on?: "YYYY-MM-DD", undo?: boolean }
 *
 * Spec §11: a `series` ticket (habit) logs a completion for the day and
 * stays open; anything else moves to Done. `undo` removes the day's
 * completion (series) or is rejected (use /move to reopen the rest).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = (await readJson<{ on?: string; undo?: boolean }>(req)) ?? {};
  const on =
    typeof body.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.on) ? body.on : londonNow().date;
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: row } = await supabase
      .from("tickets")
      .select("recurrence_mode, google_event_id, ticket_key")
      .eq("id", ref.id)
      .maybeSingle();
    const ticketKey = (row?.ticket_key as string | null) ?? key;

    if (row?.recurrence_mode === "series") {
      if (body.undo) {
        const { error } = await supabase
          .from("ticket_completions")
          .delete()
          .eq("ticket_id", ref.id)
          .eq("completed_on", on);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ticket_completions")
          .upsert(
            { ticket_id: ref.id, completed_on: on, completed_by: uid },
            { onConflict: "ticket_id,completed_on", ignoreDuplicates: true },
          );
        if (error) throw error;
        await supabase.from("ticket_activity").insert({
          ticket_id: ref.id,
          action: "complete",
          field: "completed_on",
          from_value: null,
          to_value: on,
        });
      }
      const task = await fetchTicketByKey(supabase, ticketKey);
      return NextResponse.json({ task, ticket: task, completed_on: body.undo ? null : on });
    }

    if (body.undo) {
      return NextResponse.json(
        { error: "undo only applies to series tickets; use /move to reopen" },
        { status: 400 },
      );
    }
    const moved = await moveTicket(supabase, ref.id, "done");
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    // every closed occurrence writes a completion too (spec §4.6)
    await supabase
      .from("ticket_completions")
      .upsert(
        { ticket_id: ref.id, completed_on: on, completed_by: uid },
        { onConflict: "ticket_id,completed_on", ignoreDuplicates: true },
      );
    removeGoogleEvent(supabase, "tasks", (row?.google_event_id as string | null) ?? null).catch(
      () => {},
    );
    // an after_completion recurrence spawns its next occurrence now (spec §8.3)
    const spawned = await spawnAfterCompletion(supabase, ref.id, on).catch(() => null);
    return NextResponse.json({ task: moved.task, ticket: moved.task, completed_on: on, spawned });
  } catch (err) {
    console.error("[/api/tickets/:key/complete POST]", err);
    return NextResponse.json({ error: "complete failed" }, { status: 500 });
  }
}
