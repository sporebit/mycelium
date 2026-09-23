/**
 * Tickets — the guided Weekly Review (spec §8.4, Q12). Seven sections:
 *  1 Inbox to zero · 2 Waiting For · 3 Projects without a next action ·
 *  4 Someday (promote / keep / bin) · 5 Stale (no activity 21+ days) ·
 *  6 Done-unverified (Flag 1) · 7 The week ahead.
 * Sealing writes a ticket_activity row on a per-space "Weekly review"
 * ticket (kind = audit), since no review_runs table exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listTickets, type TicketRow } from "./query";
import { londonNow } from "./categories";
import { addDays } from "./recur";
import { statusIdFor } from "./server";

export type ProjectGap = { id: string; name: string; colour: string | null; open: number };

export type ReviewPayload = {
  week: string;
  today: string;
  inbox: TicketRow[];
  waiting: TicketRow[];
  projectsWithoutNext: ProjectGap[];
  someday: TicketRow[];
  stale: TicketRow[];
  doneUnverified: TicketRow[];
  weekAhead: TicketRow[];
  sealed_at: string | null;
  review_ticket_key: string | null;
};

export function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const REVIEW_TITLE = "Weekly review";

async function reviewTicket(db: SupabaseClient, create: boolean): Promise<{ id: string; key: string | null; space_id: string } | null> {
  const { data } = await db
    .from("tickets")
    .select("id, ticket_key, space_id")
    .eq("kind", "audit")
    .eq("title", REVIEW_TITLE)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) return { id: data.id as string, key: data.ticket_key as string | null, space_id: data.space_id as string };
  if (!create) return null;
  const { data: ins, error } = await db
    .from("tickets")
    .insert({ title: REVIEW_TITLE, kind: "audit", description: "One activity row per sealed weekly review (spec §8.4).", priority_score: 0, source: "claude", someday: true })
    .select("id, ticket_key, space_id")
    .single();
  if (error || !ins) return null;
  const sid = await statusIdFor(db, ins.space_id as string, "backlog");
  if (sid) await db.from("tickets").update({ status_id: sid }).eq("id", ins.id);
  return { id: ins.id as string, key: ins.ticket_key as string | null, space_id: ins.space_id as string };
}

export async function buildReview(db: SupabaseClient): Promise<ReviewPayload> {
  const now = londonNow();
  const week = isoWeekKey();
  const staleBefore = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const [inbox, waiting, someday, verifyDone, upcoming, openAll, projects, rt] = await Promise.all([
    listTickets(db, { list: "inbox", limit: 100 }),
    listTickets(db, { list: "waiting", limit: 100 }),
    listTickets(db, { list: "someday", limit: 200 }),
    listTickets(db, { categories: ["done"], limit: 200 }),
    listTickets(db, { list: "upcoming", limit: 200 }),
    listTickets(db, { categories: ["backlog", "next", "doing", "waiting", "verify"], limit: 1000, includeSubtasks: true }),
    db.from("projects").select("id, name, colour, status").eq("status", "active").order("name"),
    reviewTicket(db, false),
  ]);

  // projects without a next/doing ticket
  const byProject = new Map<string, { open: number; nextish: number }>();
  for (const t of openAll.tickets) {
    if (!t.project_id) continue;
    const cur = byProject.get(t.project_id) ?? { open: 0, nextish: 0 };
    cur.open += 1;
    if (t.category === "next" || t.category === "doing") cur.nextish += 1;
    byProject.set(t.project_id, cur);
  }
  const projectsWithoutNext: ProjectGap[] = ((projects.data ?? []) as Array<{ id: string; name: string; colour: string | null }>)
    .filter((p) => (byProject.get(p.id)?.nextish ?? 0) === 0)
    .map((p) => ({ id: p.id, name: p.name, colour: p.colour, open: byProject.get(p.id)?.open ?? 0 }));

  const stale = openAll.tickets
    .filter((t) => !t.parent_task_id && !t.someday && t.updated_at < staleBefore && t.category !== "waiting")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(0, 50);
  const doneUnverified = verifyDone.tickets.filter((t) => !t.verified_at).slice(0, 50);
  const horizon = addDays(now.date, 7);
  const weekAhead = upcoming.tickets.filter((t) => {
    const a = t.scheduled_on ?? t.deadline_on ?? "";
    return a <= horizon;
  });

  let sealed_at: string | null = null;
  if (rt) {
    const { data: act } = await db
      .from("ticket_activity")
      .select("created_at, to_value")
      .eq("ticket_id", rt.id)
      .eq("action", "review_sealed")
      .eq("field", week)
      .limit(1)
      .maybeSingle();
    sealed_at = (act?.created_at as string | undefined) ?? null;
  }

  return {
    week,
    today: now.date,
    inbox: inbox.tickets,
    waiting: waiting.tickets,
    projectsWithoutNext,
    someday: someday.tickets,
    stale,
    doneUnverified,
    weekAhead,
    sealed_at,
    review_ticket_key: rt?.key ?? null,
  };
}

export async function sealReview(db: SupabaseClient, summary: Record<string, number>, note?: string): Promise<{ week: string; sealed_at: string; key: string | null }> {
  const week = isoWeekKey();
  const rt = await reviewTicket(db, true);
  if (!rt) throw new Error("could not create the review ticket");
  const sealed_at = new Date().toISOString();
  await db.from("ticket_activity").insert({
    ticket_id: rt.id,
    action: "review_sealed",
    field: week,
    from_value: null,
    to_value: JSON.stringify({ ...summary, note: note?.slice(0, 500) ?? null }).slice(0, 2000),
  });
  await db.from("tickets").update({ updated_at: sealed_at }).eq("id", rt.id);
  return { week, sealed_at, key: rt.key };
}
