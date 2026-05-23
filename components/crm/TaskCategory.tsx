"use client";

import { useMemo } from "react";
import type { Task } from "@/lib/types/task";
import { TaskCard } from "./TaskCard";
import { Mono } from "@/components/dashboard/Mono";

type Group = {
  key: string;
  label: string;
  tasks: Task[];
};

const UNCATEGORISED_KEY = "__uncategorised__";

function group(tasks: Task[]): Group[] {
  const buckets = new Map<string, Group>();
  for (const t of tasks) {
    const key = t.entity_id ?? UNCATEGORISED_KEY;
    const label = t.entity_name ?? "Uncategorised";
    if (!buckets.has(key)) buckets.set(key, { key, label, tasks: [] });
    buckets.get(key)!.tasks.push(t);
  }
  const arr = [...buckets.values()];
  for (const g of arr) {
    g.tasks.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }
  arr.sort((a, b) => {
    if (a.key === UNCATEGORISED_KEY) return 1;
    if (b.key === UNCATEGORISED_KEY) return -1;
    return b.tasks.length - a.tasks.length;
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
              {g.tasks.length} {g.tasks.length === 1 ? "TASK" : "TASKS"}
            </Mono>
          </header>
          <ul className="flex flex-col gap-2">
            {g.tasks.map((t) => (
              <li key={t.id}>
                <TaskCard task={t} onClick={() => onCardClick(t)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
