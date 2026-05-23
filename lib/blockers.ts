import type { Task } from "@/lib/types/task";

export type BlockerRow = {
  id: string;
  title: string;
  owner: string | null;
  stuckDays: number;
  urgency: Task["urgency"];
  key: boolean;
  isOverdue: boolean;
  priority_score: number | null;
};

export function isBlocker(t: Task, todayKey: string): boolean {
  if (t.completed_at) return false;
  if (t.due_date && t.due_date < todayKey) return true;
  if (t.key && (t.urgency === "today" || t.urgency === "this_week")) return true;
  return false;
}

function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ams = Date.UTC(ay, am - 1, ad);
  const bms = Date.UTC(by, bm - 1, bd);
  return Math.round((ams - bms) / 86_400_000);
}

function isoToLocalKey(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

export function toBlockerRow(t: Task, todayKey: string, tz: string): BlockerRow {
  const overdue = !!(t.due_date && t.due_date < todayKey);
  let stuckDays: number;
  if (overdue && t.due_date) {
    stuckDays = daysBetweenKeys(todayKey, t.due_date);
  } else {
    const updatedKey = isoToLocalKey(t.updated_at, tz);
    stuckDays = Math.max(0, daysBetweenKeys(todayKey, updatedKey));
  }
  return {
    id: t.id,
    title: t.title,
    owner: t.owner,
    stuckDays,
    urgency: t.urgency,
    key: t.key,
    isOverdue: overdue,
    priority_score: t.priority_score,
  };
}

export function sortBlockers(rows: BlockerRow[]): BlockerRow[] {
  // 1. Overdue first (most overdue at top)
  // 2. Then key + today (priority_score desc)
  // 3. Then key + this_week (priority_score desc)
  function bucket(r: BlockerRow): number {
    if (r.isOverdue) return 0;
    if (r.key && r.urgency === "today") return 1;
    if (r.key && r.urgency === "this_week") return 2;
    return 3;
  }
  return [...rows].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) {
      // most overdue (largest stuckDays) first
      return b.stuckDays - a.stuckDays;
    }
    // higher priority_score first; nulls last
    const pa = a.priority_score ?? -Infinity;
    const pb = b.priority_score ?? -Infinity;
    return pb - pa;
  });
}
