/**
 * The capture review queue (master run §5 "Routing": every capture goes to
 * review, as swipe cards, cleared in the evening close).
 *
 * One definition of "waiting for review", used by the list, the count, the
 * evening deck and the seven-day rule, so they cannot disagree. Before
 * 2026-11-20 the list and the count each had their own filter: the count
 * missed typed captures and deleted rows, and an approved quote stayed in
 * the list for ever because "low confidence" was tested without "not yet
 * reviewed".
 *
 * Waiting = not reviewed, not discarded, not deleted, finished processing,
 * and not already filed by the seven-day rule. The original of a split dump
 * is marked reviewed when it is split (its items are the cards), so it
 * never appears.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveTicket } from "@/lib/tickets/server";

export const QUEUE_SELECT =
  "id, source, raw_text, audio_url, audio_path, classification, llm_source, routed_to, routed_id, reviewed_at, discarded_at, created_at, space_id, parent_capture_id, segment_index, status, text_source, text_edited";

type Filterable = { is(column: string, value: null): Filterable; eq(column: string, value: string): Filterable };

/**
 * Apply the "waiting for review" filter to a raw_captures query. The query
 * builder's own type is too deep to carry through a generic, so the filter
 * is applied through the two methods it needs and the builder handed back
 * as it came.
 */
export function waitingForReview<T>(q: T): T {
  return (q as unknown as Filterable).is("reviewed_at", null).is("discarded_at", null).is("deleted_at", null).is("auto_filed_at", null).eq("status", "processed") as unknown as T;
}

export async function countWaiting(db: SupabaseClient): Promise<number> {
  const q = db.from("raw_captures").select("id", { count: "exact", head: true });
  const { count, error } = await waitingForReview(q);
  if (error) {
    console.error("[capture/queue] count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

const WHERE = new Set(["anywhere", "home", "out"]);
const WINDOWS = new Set(["anytime", "office_hours", "evenings", "weekend"]);
const POINTS = new Set([1, 2, 3, 5, 8, 13]);

/**
 * Accepting a capture's card accepts the ticket it made: the guesses kept in
 * `suggested` (where, tools, when, size) are applied and the ticket leaves
 * the Inbox for Next. Without this a captured task would be triaged twice,
 * once as a card and once in the Tickets Inbox. A ticket that has already
 * left the Inbox is left exactly as it is.
 */
export async function acceptRoutedTicket(db: SupabaseClient, ticketId: string): Promise<"moved" | "left"> {
  const { data } = await db
    .from("tickets")
    .select("id, suggested, where_ctx, tools, time_window, points, ticket_status:ticket_statuses(category)")
    .eq("id", ticketId)
    .maybeSingle();
  const t = data as { id: string; suggested: Record<string, unknown> | null; where_ctx: string | null; tools: string[] | null; time_window: string | null; points: number | null; ticket_status: { category: string } | { category: string }[] | null } | null;
  if (!t) return "left";
  const category = (Array.isArray(t.ticket_status) ? t.ticket_status[0] : t.ticket_status)?.category;
  if (category !== "inbox") return "left";

  const s = t.suggested ?? {};
  const extra: Record<string, unknown> = {};
  if (typeof s.where_ctx === "string" && WHERE.has(s.where_ctx) && (!t.where_ctx || t.where_ctx === "anywhere")) extra.where_ctx = s.where_ctx;
  if (Array.isArray(s.tools) && s.tools.every((x) => typeof x === "string") && (!t.tools || t.tools.length === 0 || (t.tools.length === 1 && t.tools[0] === "none"))) extra.tools = s.tools;
  if (typeof s.time_window === "string" && WINDOWS.has(s.time_window) && (!t.time_window || t.time_window === "anytime")) extra.time_window = s.time_window;
  if (typeof s.points === "number" && POINTS.has(s.points) && t.points == null) extra.points = s.points;

  const moved = await moveTicket(db, t.id, "next", { forwardOnly: true, extra });
  return moved.ok ? "moved" : "left";
}

/** The ticket a capture made has left the Inbox by another door: its card is answered. */
export async function markReviewedByTicket(db: SupabaseClient, ticketId: string): Promise<void> {
  const { error } = await db
    .from("raw_captures")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("routed_to", "tickets")
    .eq("routed_id", ticketId)
    .is("reviewed_at", null);
  if (error) console.error("[capture/queue] reviewed stamp failed:", error.message);
}
