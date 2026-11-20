/**
 * Sending a nudge crosses from one person to another, which is why it lives
 * here: the sender's request ends by writing into the RECIPIENT'S space,
 * as the recipient (withUser). The only thing that licenses that step is
 * the check before it, made with the sender's own client under the
 * sender's own row rules: can she see this ticket? If she cannot, she gets
 * "not found" and nothing is written for anyone.
 *
 * The recipient is whoever the item is for: its assignee, else whoever
 * made it. Nobody nudges themselves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { interrupt } from "@/lib/nudges/interrupt";
import { nameToShow, nudgeDone, nudgeSpoken, presetFor } from "@/lib/nudges/nudge";
import { withUser } from "./withUser";

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const cat = (s: { category: string } | Array<{ category: string }> | null) => (Array.isArray(s) ? s[0]?.category : s?.category) ?? "";

async function nameOf(db: SupabaseClient, uid: string, fallback: string): Promise<string> {
  const { data } = await db.from("profiles").select("display_name").eq("id", uid).maybeSingle();
  return nameToShow((data as { display_name: string | null } | null)?.display_name, fallback);
}

/** Send a nudge about a ticket the sender can see. `senderDb` acts as the sender. */
export async function sendNudge(senderDb: SupabaseClient, senderId: string, ticketId: string, presetKey: unknown): Promise<{ ok: true; to: string } | Fail> {
  const preset = presetFor(presetKey);
  if (!preset) return fail(400, "Pick one of the nudges offered.");

  // As the sender, under her row rules. No row means she may not see it (or it does not exist): the same answer either way.
  const { data } = await senderDb
    .from("tickets")
    .select("id, title, created_by, assignee_id, ticket_status:ticket_statuses(category)")
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  const t = data as { id: string; title: string; created_by: string | null; assignee_id: string | null; ticket_status: { category: string } | Array<{ category: string }> | null } | null;
  if (!t) return fail(404, "not found");
  const recipient = t.assignee_id ?? t.created_by;
  if (!recipient) return fail(404, "not found");
  if (recipient === senderId) return fail(400, "That one is yours.");
  if (["done", "cancelled"].includes(cat(t.ticket_status))) return fail(409, "That one is already finished.");

  const from = await nameOf(senderDb, senderId, "Someone");
  const wording = preset.say(from, t.title);

  await withUser(recipient, async (db) => {
    const { error } = await db.from("nudges").insert({ ticket_id: t.id, from_user: senderId, from_name: from, preset: preset.key, wording });
    if (error) throw new Error(`nudge not saved: ${error.message}`);
    // A person reaching for you is not the app nagging: outside the budget, never held for quiet hours' sake by the budget rules.
    await interrupt(db, recipient, { kind: "nudge", origin: "person", title: wording, url: "/today", ticketId: t.id, speak: nudgeSpoken(from, preset.key) });
  });
  return { ok: true, to: recipient };
}

/** Whether the caller may nudge this ticket, and whose it is (their name as the caller may see it). `senderDb` acts as the caller. */
export async function canNudge(senderDb: SupabaseClient, senderId: string, ticketId: string): Promise<{ can: boolean; to: string | null }> {
  const { data } = await senderDb.from("tickets").select("created_by, assignee_id, ticket_status:ticket_statuses(category)").eq("id", ticketId).is("deleted_at", null).maybeSingle();
  const t = data as { created_by: string | null; assignee_id: string | null; ticket_status: { category: string } | Array<{ category: string }> | null } | null;
  const recipient = t ? (t.assignee_id ?? t.created_by) : null;
  if (!t || !recipient || recipient === senderId || ["done", "cancelled"].includes(cat(t.ticket_status))) return { can: false, to: null };
  // Her view of his profile is whatever the row rules already allow (people who share with each other can see each other's name).
  return { can: true, to: await nameOf(senderDb, recipient, "") || null };
}

export type OpenNudge = { id: string; at: string; from: string; text: string; ticket_id: string; ticket_title: string };

/** The recipient's nudges that still stand: unanswered, from the last two days, about things not yet finished. `db` acts as the recipient. */
export async function openNudges(db: SupabaseClient, now: Date = new Date()): Promise<OpenNudge[]> {
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("nudges")
    .select("id, at, from_name, wording, ticket_id, ticket:tickets(title, ticket_status:ticket_statuses(category))")
    .is("answer", null)
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`nudges: ${error.message}`);
  type Row = { id: string; at: string; from_name: string; wording: string; ticket_id: string; ticket: { title: string; ticket_status: { category: string } | Array<{ category: string }> | null } | Array<{ title: string; ticket_status: { category: string } | Array<{ category: string }> | null }> | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ r, ticket: Array.isArray(r.ticket) ? r.ticket[0] : r.ticket }))
    .filter(({ ticket }) => ticket && !["done", "cancelled"].includes(cat(ticket.ticket_status)))
    .map(({ r, ticket }) => ({ id: r.id, at: r.at, from: r.from_name, text: r.wording, ticket_id: r.ticket_id, ticket_title: ticket!.title }));
}

/** "Not today": set aside, no reason asked, nobody told. `db` acts as the recipient. */
export async function setAsideNudge(db: SupabaseClient, id: string, now: Date = new Date()): Promise<boolean> {
  const { data } = await db.from("nudges").update({ answer: "not_today", answered_at: now.toISOString() }).eq("id", id).is("answer", null).select("id");
  return !!data?.length;
}

/**
 * Tell whoever nudged that the thing is done (research rule 30). Run for
 * one person from the five-minute tick: their nudged tickets that have
 * since been finished, each told once. Returns how many were told.
 */
export async function tellSendersOfDone(uid: string, now: Date = new Date()): Promise<number> {
  type Row = { id: string; from_user: string | null; answer: string | null; ticket: { title: string; ticket_key: string | null; ticket_status: { category: string } | Array<{ category: string }> | null } | Array<{ title: string; ticket_key: string | null; ticket_status: { category: string } | Array<{ category: string }> | null }> | null };
  const due = await withUser(uid, async (db) => {
    const { data } = await db
      .from("nudges")
      .select("id, from_user, answer, ticket:tickets(title, ticket_key, ticket_status:ticket_statuses(category))")
      .is("done_told_at", null)
      .gte("at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
      .limit(50);
    const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ r, ticket: Array.isArray(r.ticket) ? r.ticket[0] : r.ticket })).filter(({ ticket }) => ticket && cat(ticket.ticket_status) === "done");
    if (!rows.length) return { rows: [], doer: "" };
    return { rows, doer: await nameOf(db, uid, "They") };
  });
  let told = 0;
  for (const { r, ticket } of due.rows) {
    // Claim it first, as the recipient: two ticks must not both tell her.
    const claimed = await withUser(uid, async (db) => {
      const { data } = await db
        .from("nudges")
        .update({ done_told_at: now.toISOString(), ...(r.answer ? {} : { answer: "done", answered_at: now.toISOString() }) })
        .eq("id", r.id)
        .is("done_told_at", null)
        .select("id");
      return !!data?.length;
    });
    if (!claimed || !r.from_user || !ticket) continue;
    const words = nudgeDone(due.doer, ticket.title);
    try {
      await withUser(r.from_user, (db) => interrupt(db, r.from_user as string, { kind: "nudge_done", origin: "reply", title: words.title, body: words.body, url: ticket.ticket_key ? `/organisation/tickets/${ticket.ticket_key}` : "/work" }));
      told += 1;
    } catch (err) {
      console.error("[nudges] could not tell the sender:", err instanceof Error ? err.message : err);
    }
  }
  return told;
}
