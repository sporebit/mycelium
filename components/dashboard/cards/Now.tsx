"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { Task } from "@/lib/types/task";
import { scoreTaskForContext } from "@/lib/compost/now-filter";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useCurrentDevice } from "@/lib/hooks/useCurrentDevice";

/**
 * Dashboard surface for the NOW filter: top-five tasks matching the
 * user's current context. Tapping the panel header navigates to
 * /organisation/tasks?filter=now where the same scoring is applied.
 */
export function Now() {
  const [currentCtx] = useCurrentContext();
  const detectedDevice = useCurrentDevice();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks?status=open")
      .then((r) => r.json())
      .then((j: { tasks?: Task[] }) => {
        if (cancelled) return;
        setTasks(Array.isArray(j.tasks) ? j.tasks : []);
      })
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const top: { task: Task; score: number }[] = [];
  for (const t of tasks ?? []) {
    if (t.parent_task_id) continue;
    const { score, contradicts } = scoreTaskForContext(
      t,
      currentCtx,
      detectedDevice,
    );
    if (contradicts) continue;
    top.push({ task: t, score });
  }
  top.sort((a, b) => b.score - a.score);
  const visible = top.slice(0, 5);

  return (
    <Panel
      borderless
      title="NOW"
      topRight={
        <Link
          href="/organisation/tasks?filter=now"
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
        >
          OPEN →
        </Link>
      }
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
        {detectedDevice}
        {currentCtx.where ? ` · ${currentCtx.where}` : ""}
        {currentCtx.energy ? ` · ${currentCtx.energy} energy` : ""}
        {currentCtx.context_tag ? ` · ${currentCtx.context_tag}` : ""}
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-ink-2/60">
        {tasks === null ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            Loading…
          </li>
        ) : visible.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            Nothing matches your current context.
          </li>
        ) : (
          visible.map(({ task, score }) => (
            <li key={task.id} className="py-1.5">
              <Link
                href={`/organisation/tasks?task=${task.id}`}
                className="flex items-center gap-2 hover:text-accent transition-colors"
              >
                <span className="text-sm text-ink-4 flex-1 truncate">
                  {task.title}
                </span>
                <Mono className="text-[10px] text-ink-3 shrink-0">
                  {score}/4
                </Mono>
              </Link>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
