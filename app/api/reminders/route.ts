import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { moveTicket, principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { reminderFromTicket, rruleFromRecurrence, REMINDER_SELECT, type ReminderTicketRow } from "@/lib/tickets/reminderShape";

export const runtime = "nodejs";

/**
 * /api/reminders — compatibility surface for the Reminders page since the
 * fold (spec §8.3): reminders are `kind = reminder` tickets. The response
 * keeps the old shape { id, message, due_at, recurrence, sent_at, cancelled }.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("tickets")
      .select(REMINDER_SELECT)
      .eq("kind", "reminder")
      .is("deleted_at", null)
      .is("cancelled_at", null)
      .order("remind_at", { ascending: true });
    if (error) throw error;
    auditListRead(req, data, "organisation", "tickets");
    return NextResponse.json({ reminders: ((data ?? []) as unknown as ReminderTicketRow[]).map(reminderFromTicket) });
  } catch (err) {
    console.error("[/api/reminders GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = { message: string; due_at: string; recurrence?: string | null };

export async function POST(req: NextRequest) {
  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.message?.trim() || !body.due_at || Number.isNaN(Date.parse(body.due_at))) {
    return NextResponse.json({ error: "message + due_at required" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const uid = await principalUid();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const rrule = rruleFromRecurrence(body.recurrence);
    const due = new Date(body.due_at);
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        title: body.message.trim(),
        kind: "reminder",
        remind_at: due.toISOString(),
        scheduled_on: due.toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
        recurrence_rrule: rrule,
        recurrence_mode: null,
        source: "ui",
        owner: uid,
        urgency: "this_week",
        priority_score: 0.5,
        meta: { legacy_recurrence: body.recurrence?.trim() || null },
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    const moved = await moveTicket(supabase, (data as { id: string }).id, "next");
    const { data: row } = await supabase.from("tickets").select(REMINDER_SELECT).eq("id", (data as { id: string }).id).single();
    if (!moved.ok || !row) throw new Error("reload failed");
    return NextResponse.json({ reminder: reminderFromTicket(row as unknown as ReminderTicketRow) });
  } catch (err) {
    console.error("[/api/reminders POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
