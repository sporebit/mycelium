/**
 * The finish line (research rule 22; master run §6: "a finish-line view,
 * 80%+ done").
 *
 * Starting is easy and the last fifth is where things stall. This picks at
 * most three things that are nearly done, says exactly what is left on
 * each, and offers three exits: Finish, Good enough (close as it is), Drop.
 * Three, not a list: a list of nearly-finished things is another backlog.
 *
 * "Nearly done" is read from what the ticket already records, never
 * guessed:
 *   - it is waiting only to be checked (the Verify column);
 *   - its checklist is 80% ticked or more;
 *   - its sub-tasks are 80% done or more.
 * A ticket with no checklist and no sub-tasks has no measurable progress
 * and is never shown here; it belongs on Today.
 *
 * Pure: rows in, the three out.
 */

export const FINISH_AT = 0.8;
export const FINISH_MAX = 3;

export type Progress = { done: number; total: number };

export type FinishCandidate = {
  id: string;
  key: string | null;
  title: string;
  /** The status category: next, doing, waiting, verify… */
  category: string;
  next_step: string | null;
  parked_note: string | null;
  /** Checklist steps (step-driven tickets), if it has a checklist. */
  steps: Progress | null;
  /** Direct sub-tasks, if it has any. */
  subtasks: Progress | null;
  /** When it last changed, ISO. The longest-stalled comes first among equals. */
  updated_at: string;
};

export type FinishItem = {
  id: string;
  key: string | null;
  title: string;
  /** 0–1: how done it is. */
  ratio: number;
  /** What is left, as one plain sentence. */
  left: string;
  /** The step to take now: the ticket's own next step, or where it was parked, or nothing. */
  next_step: string | null;
  /** Days since it last changed (whole days, never negative). */
  idle_days: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How close a ticket is, and what is left; null when it is not nearly done or has nothing to measure. */
export function closeness(c: Pick<FinishCandidate, "category" | "steps" | "subtasks">): { ratio: number; left: string } | null {
  const measured: Array<{ ratio: number; left: string }> = [];
  for (const [p, one, many] of [
    [c.steps, "step", "steps"],
    [c.subtasks, "sub-task", "sub-tasks"],
  ] as const) {
    if (!p || p.total < 2) continue;
    const done = Math.min(Math.max(p.done, 0), p.total);
    const ratio = done / p.total;
    if (ratio >= 1) measured.push({ ratio: 1, left: `Every ${one} is done. Closing it is all that is left.` });
    else if (ratio >= FINISH_AT) measured.push({ ratio, left: `${plural(p.total - done, one, many)} left of ${p.total}.` });
    else return null; // one part of it is clearly not nearly done
  }
  if (c.category === "verify") {
    // Done and waiting to be checked: as near as it gets without being closed.
    const best = measured.sort((a, b) => a.ratio - b.ratio)[0];
    return best && best.ratio < 1 ? best : { ratio: 0.95, left: "The work is done. It is waiting to be checked and closed." };
  }
  if (!measured.length) return null;
  // The least-finished part is the honest answer to "what is left".
  return measured.sort((a, b) => a.ratio - b.ratio)[0];
}

/** At most three, nearest first; among equals, the one that has waited longest. */
export function finishLine(candidates: readonly FinishCandidate[], now: Date = new Date(), max: number = FINISH_MAX): FinishItem[] {
  const out: Array<FinishItem & { at: number }> = [];
  for (const c of candidates) {
    if (["done", "cancelled", "inbox"].includes(c.category)) continue;
    const near = closeness(c);
    if (!near) continue;
    const at = Date.parse(c.updated_at) || now.getTime();
    out.push({
      id: c.id,
      key: c.key,
      title: c.title,
      ratio: near.ratio,
      left: near.left,
      next_step: c.next_step?.trim() || (c.parked_note?.trim() ? `Pick up where it was left: ${c.parked_note.trim()}` : null),
      idle_days: Math.max(0, Math.floor((now.getTime() - at) / 86_400_000)),
      at,
    });
  }
  out.sort((a, b) => b.ratio - a.ratio || a.at - b.at || a.title.localeCompare(b.title));
  return out.slice(0, max).map((i) => ({ id: i.id, key: i.key, title: i.title, ratio: i.ratio, left: i.left, next_step: i.next_step, idle_days: i.idle_days }));
}
