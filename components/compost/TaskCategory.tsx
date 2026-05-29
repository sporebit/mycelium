"use client";

import { useMemo } from "react";
import type { Task } from "@/lib/types/task";
import { TaskCard } from "./TaskCard";
import { Mono } from "@/components/dashboard/Mono";

type Group = {
  key: string;
  label: string;
  /** Display order: each parent immediately followed by its sub-tasks. */
  display: Task[];
  /** Top-level count only (for the header counter). */
  parentCount: number;
};

const UNCATEGORISED_KEY = "__uncategorised__";

function group(tasks: Task[]): Group[] {
  // Sub-tasks live in the same group as their parent — group by parent's
  // entity rather than the sub-task's (which is usually inherited anyway).
  const byId = new Map<string, Task>();
  for (const t of tasks) byId.set(t.id, t);

  const subsByParent = new Map<string, Task[]>();
  const topLevel: Task[] = [];
  for (const t of tasks) {
    if (t.parent_task_id) {
      const list = subsByParent.get(t.parent_task_id) ?? [];
      list.push(t);
      subsByParent.set(t.parent_task_id, list);
    } else {
      topLevel.push(t);
    }
  }

  const buckets = new Map<string, Group>();
  for (const t of topLevel) {
    const key = t.entity_id ?? UNCATEGORISED_KEY;
    const label = t.entity_name ?? "Uncategorised";
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, display: [], parentCount: 0 });
    }
    const bucket = buckets.get(key)!;
    bucket.parentCount += 1;
    bucket.display.push(t);
  }

  // Within each bucket: open parents sort by priority desc, completed
  // parents sink to the bottom (newest-done first), sub-tasks appended
  // after their parent in created order.
  for (const g of buckets.values()) {
    const open = g.display
      .filter((t) => !t.completed_at)
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    const done = g.display
      .filter((t) => !!t.completed_at)
      .sort((a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
      );
    const interleaved: Task[] = [];
    for (const parent of [...open, ...done]) {
      interleaved.push(parent);
      const kids = (subsByParent.get(parent.id) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      interleaved.push(...kids);
    }
    g.display = interleaved;
  }

  // Orphan sub-tasks (parent in a different group or missing) — drop them
  // into Uncategorised so they're not invisible. Rare but defensive.
  for (const [parentId, kids] of subsByParent) {
    if (!byId.has(parentId)) {
      let uncat = buckets.get(UNCATEGORISED_KEY);
      if (!uncat) {
        uncat = {
          key: UNCATEGORISED_KEY,
          label: "Uncategorised",
          display: [],
          parentCount: 0,
        };
        buckets.set(UNCATEGORISED_KEY, uncat);
      }
      uncat.display.push(...kids);
    }
  }

  const arr = [...buckets.values()];
  arr.sort((a, b) => {
    if (a.key === UNCATEGORISED_KEY) return 1;
    if (b.key === UNCATEGORISED_KEY) return -1;
    return b.parentCount - a.parentCount;
  });
  return arr;
}

export function TaskCategory({
  tasks,
  onCardClick,
}: {
  tasks: Task[];
  onCardClick: (t: Task) => void;
}) {
  const groups = useMemo(() => group(tasks), [tasks]);

  // Sub-task stats per parent for badge rendering.
  const subStatsById = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const prev = m.get(t.parent_task_id) ?? { done: 0, total: 0 };
      prev.total += 1;
      if (t.completed_at) prev.done += 1;
      m.set(t.parent_task_id, prev);
    }
    return m;
  }, [tasks]);

  if (groups.length === 0) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
        No tasks
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key}>
          <header className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-4 font-[family-name:var(--font-mono)]">
              {g.label}
            </span>
            <Mono className="text-[10px] text-ink-3">
              {g.parentCount} {g.parentCount === 1 ? "TASK" : "TASKS"}
            </Mono>
          </header>
          <ul className="flex flex-col gap-2">
            {g.display.map((t) => {
              const isSub = !!t.parent_task_id;
              return (
                <li key={t.id} className={isSub ? "pl-6 relative" : ""}>
                  {isSub && (
                    <span
                      aria-hidden
                      className="absolute left-2 top-0 bottom-0 w-px bg-ink-2"
                    />
                  )}
                  <TaskCard
                    task={t}
                    onClick={() => onCardClick(t)}
                    compact={isSub}
                    muted={isSub}
                    subStats={!isSub ? (subStatsById.get(t.id) ?? null) : null}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
