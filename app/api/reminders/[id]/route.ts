import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { moveTicket, principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { reminderFromTicket, rruleFromRecurrence, REMINDER_SELECT, type ReminderTicketRow } from "@/lib/tickets/reminderShape";

export const runtime = "nodejs";

/** PATCH { message?, due_at?, recurrence?, cancelled? } on a reminder ticket. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const uid = await principalUid();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.message === "string" && body.message.trim()) update.title = body.message.trim();
    if (typeof body.due_at === "string" && !Number.isNaN(Date.parse(body.due_at))) {
      const due = new Date(body.due_at);
      update.remind_at = due.toISOString();
      update.remind_sent_at = null;
      update.scheduled_on = due.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    }
    if (body.recurrence !== undefined) {
      const rrule = rruleFromRecurrence(typeof body.recurrence === "string" ? body.recurrence : null);
      update.recurrence_rrule = rrule;
      update.recurrence_mode = null;
      update.meta = { legacy_recurrence: typeof body.recurrence === "string" ? body.recurrence.trim() || null : null };
    }
    if (Object.keys(update).length > 1) {
      const { error } = await supabase.from("tickets").update(update).eq("id", id).eq("kind", "reminder");
      if (error) throw error;
    }
    if (typeof body.cancelled === "boolean") {
      const moved = await moveTicket(supabase, id, body.cancelled ? "cancelled" : "next");
      if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    }
    const { data } = await supabase.from("tickets").select(REMINDER_SELECT).eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ reminder: reminderFromTicket(data as unknown as ReminderTicketRow) });
  } catch (err) {
    console.error("[/api/reminders/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const uid = await principalUid();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { error } = await supabase.from("tickets").delete().eq("id", id).eq("kind", "reminder");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reminders/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
