import type { Task } from "@/lib/types/task";

// GTD lens over the *existing* task fields.
//
// The spec (claude/tickets-spec.md §3.2) binds GTD lists to a status
// `category` (inbox/next/waiting/…). 0116 added that column but the app
// still reads/writes the legacy `status` enum, so `status_id`/category is a
// stale one-time backfill (every open ticket sits at category `backlog`).
// Until the app goes category-native (a later Part B increment with the
// Clarify stack), this module derives GTD buckets from the fields Phil
// actually edits today: `status`, `urgency`, `due_date`, `scheduled_at`,
// `completed_at`. Keep the derivation HERE and nowhere else, so the swap to
// category-native filtering is a single-file change.

export type GtdBucket =
  | "today"
  | "next"
  | "waiting"
  | "upcoming"
  | "someday"
  | "logbook";

export const GTD_BUCKETS: {
  id: GtdBucket;
  label: string;
  hint: string;
}[] = [
  { id: "today", label: "Today", hint: "Due, scheduled, or flagged for today (includes overdue)" },
  { id: "next", label: "Next", hint: "In progress — your active work" },
  { id: "waiting", label: "Waiting", hint: "Blocked or waiting on a third party" },
  { id: "upcoming", label: "Upcoming", hint: "Has a future due or scheduled date" },
  { id: "someday", label: "Someday", hint: "Someday / maybe" },
  { id: "logbook", label: "Logbook", hint: "Completed or cancelled" },
];

const WAITING_STATUSES = new Set(["blocked", "on_hold", "waiting_third_party"]);

/** Local YYYY-MM-DD for "now", matching the format of `due_date`. */
function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Open = not completed and not cancelled. */
function isOpen(t: Task): boolean {
  return !t.completed_at && t.status !== "cancelled";
}

/** The date this ticket is anchored to, if any (due date wins over scheduled). */
function anchorDateKey(t: Task): string | null {
  if (t.due_date) return t.due_date; // already YYYY-MM-DD
  if (t.scheduled_at) return t.scheduled_at.slice(0, 10);
  return null;
}

/** Whether a ticket belongs in a GTD bucket. Buckets are filters, not a
 *  partition — a ticket can match several (e.g. in-progress AND due today). */
export function inBucket(t: Task, bucket: GtdBucket, now: Date = new Date()): boolean {
  const today = todayKey(now);
  switch (bucket) {
    case "logbook":
      return !!t.completed_at || t.status === "cancelled";
    case "someday":
      return isOpen(t) && t.urgency === "someday";
    case "waiting":
      return isOpen(t) && WAITING_STATUSES.has(t.status);
    case "next":
      return isOpen(t) && t.status === "in_progress";
    case "today": {
      if (!isOpen(t)) return false;
      if (t.urgency === "today") return true;
      const d = anchorDateKey(t);
      return d !== null && d <= today; // includes overdue
    }
    case "upcoming": {
      if (!isOpen(t)) return false;
      const d = anchorDateKey(t);
      return d !== null && d > today;
    }
  }
}

/** Count of top-level tickets matching each bucket, for the tab badges. */
export function bucketCounts(
  tasks: Task[],
  now: Date = new Date(),
): Record<GtdBucket, number> {
  const out = {
    today: 0,
    next: 0,
    waiting: 0,
    upcoming: 0,
    someday: 0,
    logbook: 0,
  } as Record<GtdBucket, number>;
  for (const t of tasks) {
    if (t.parent_task_id) continue; // top-level only, matching the list view
    for (const b of GTD_BUCKETS) {
      if (inBucket(t, b.id, now)) out[b.id] += 1;
    }
  }
  return out;
}
