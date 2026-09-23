import type { Task } from "@/lib/types/task";
import { addDays, isOverdue } from "@/lib/tickets/when";

/**
 * Key blockers (dashboard card + morning briefing). Since spec §18 the
 * urgency labels are gone: a blocker is an open ticket that is overdue, or
 * a key ticket due within seven days. HOT = overdue, WARM = due soon.
 */
export type BlockerRow = {
  id: string;
  title: string;
  owner: string | null;
  stuckDays: number;
  /** The deadline it is measured against (deadline_on, else the legacy due_date). */
  dueOn: string | null;
  key: boolean;
  isOverdue: boolean;
  /** Due within seven days of today (not overdue). */
  dueSoon: boolean;
  priority_score: number | null;
  parent_task_id: string | null;
  parent_title: string | null;
};

const SOON_DAYS = 7;

function deadlineOf(t: Task): string | null {
  return t.deadline_on ?? t.due_date ?? null;
}

function dueSoon(t: Task, todayKey: string): boolean {
  const d = deadlineOf(t);
  return !!d && d >= todayKey && d <= addDays(todayKey, SOON_DAYS);
}

export function isBlocker(t: Task, todayKey: string): boolean {
  if (t.completed_at) return false;
  if (isOverdue(t, todayKey)) return true;
  if (t.key && dueSoon(t, todayKey)) return true;
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

export function toBlockerRow(
  t: Task,
  todayKey: string,
  tz: string,
  parentTitleLookup?: Map<string, string>
): BlockerRow {
  const dueOn = deadlineOf(t);
  const overdue = isOverdue(t, todayKey);
  let stuckDays: number;
  if (overdue && dueOn) {
    stuckDays = daysBetweenKeys(todayKey, dueOn);
  } else {
    const updatedKey = isoToLocalKey(t.updated_at, tz);
    stuckDays = Math.max(0, daysBetweenKeys(todayKey, updatedKey));
  }
  const parentTitle =
    t.parent_task_id && parentTitleLookup
      ? (parentTitleLookup.get(t.parent_task_id) ?? null)
      : null;
  return {
    id: t.id,
    title: t.title,
    owner: t.owner,
    stuckDays,
    dueOn,
    key: t.key,
    isOverdue: overdue,
    dueSoon: !overdue && dueSoon(t, todayKey),
    priority_score: t.priority_score,
    parent_task_id: t.parent_task_id,
    parent_title: parentTitle,
  };
}

export function sortBlockers(rows: BlockerRow[]): BlockerRow[] {
  // 1. Overdue first (most overdue at top)
  // 2. Then key + due soon (soonest deadline, then priority_score desc)
  // 3. Then the rest (priority_score desc)
  function bucket(r: BlockerRow): number {
    if (r.isOverdue) return 0;
    if (r.key && r.dueSoon) return 1;
    return 2;
  }
  return [...rows].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) {
      // most overdue (largest stuckDays) first
      return b.stuckDays - a.stuckDays;
    }
    if (ba === 1 && a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    // higher priority_score first; nulls last
    const pa = a.priority_score ?? -Infinity;
    const pb = b.priority_score ?? -Infinity;
    return pb - pa;
  });
}
