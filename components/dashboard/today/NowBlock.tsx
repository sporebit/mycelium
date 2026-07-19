"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Surface, Button, Skeleton, Sheet, Label } from "@/components/ui";
import type { Task } from "@/lib/types/task";
import { scoreTaskForContext } from "@/lib/compost/now-filter";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useCurrentDevice } from "@/lib/hooks/useCurrentDevice";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import { triggerFieldPulse } from "@/lib/motion";

const KEY = "/api/tasks?status=open";

type TasksResponse = { tasks?: Task[] };

type Scored = { task: Task; score: number };

export function NowBlock() {
  const [currentCtx] = useCurrentContext();
  const detectedDevice = useCurrentDevice();
  const { data, isLoading } = useApi<TasksResponse>(KEY);
  const [openInfoFor, setOpenInfoFor] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());

  const top: Scored[] = useMemo(() => {
    const out: Scored[] = [];
    for (const t of data?.tasks ?? []) {
      if (t.parent_task_id) continue;
      const { score, contradicts } = scoreTaskForContext(
        t,
        currentCtx,
        detectedDevice,
      );
      if (contradicts) continue;
      out.push({ task: t, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 3);
  }, [data, currentCtx, detectedDevice]);

  async function complete(task: Task) {
    // Mark for fade-out, run mutation. On success, SWR revalidates and the
    // row disappears naturally; on failure, rollback restores the list and
    // we clear the fade class.
    setFadingOut((s) => new Set(s).add(task.id));
    await mutateApi<TasksResponse>(
      KEY,
      (current) => ({
        tasks: (current?.tasks ?? []).filter((t) => t.id !== task.id),
      }),
      async () => {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        if (!res.ok) throw new Error(`complete failed (${res.status})`);
        triggerFieldPulse(
          window.innerWidth / 2,
          window.innerHeight - 40,
        );
      },
    );
    setFadingOut((s) => {
      const next = new Set(s);
      next.delete(task.id);
      return next;
    });
  }

  const infoTask = top.find((s) => s.task.id === openInfoFor)?.task ?? null;
  const infoScore = top.find((s) => s.task.id === openInfoFor)?.score ?? 0;

  return (
    <Surface level={1} className="p-5 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <Label>Now</Label>
        <Link
          href="/organisation/tasks?filter=now"
          className="text-[10px] uppercase tracking-[0.08em] text-text-lo hover:text-text-hi font-[family-name:var(--font-jetbrains-mono)]"
        >
          Open →
        </Link>
      </div>

      {isLoading ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-9 w-full" />
            </li>
          ))}
        </ul>
      ) : top.length === 0 ? (
        <Surface level={2} border={false} className="px-4 py-6 text-center">
          <div className="text-sm text-text-mid">
            Nothing urgent.{" "}
            <Link
              href="/?view=everything"
              className="text-text-hi underline underline-offset-2 hover:text-glow"
            >
              Check Everything
            </Link>{" "}
            for the full list.
          </div>
        </Surface>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {top.map(({ task, score }) => {
            const fading = fadingOut.has(task.id);
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 py-2.5 transition-opacity duration-[var(--dur-base)] [transition-timing-function:var(--ease-out)] ${
                  fading ? "opacity-30" : "opacity-100"
                }`}
              >
                <Link
                  href={`/organisation/tasks?task=${task.id}`}
                  className="flex-1 min-w-0 text-sm text-text-hi hover:text-glow transition-colors truncate"
                >
                  {task.title}
                </Link>
                {task.context_where && (
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-v2-sm bg-surface-2 text-text-lo"
                    title={`where: ${task.context_where}`}
                  >
                    {task.context_where}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpenInfoFor(task.id)}
                  aria-label="Score breakdown"
                  className="shrink-0 h-6 w-6 rounded-full text-[11px] text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
                >
                  ?
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void complete(task)}
                  disabled={fading}
                >
                  Done
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={!!openInfoFor}
        onClose={() => setOpenInfoFor(null)}
        title="Why this is up top"
      >
        {infoTask ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="text-text-hi font-medium">{infoTask.title}</div>
            <div className="text-text-mid">
              Score: <span className="text-text-hi">{infoScore}/4</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-text-mid">
              <div>Device</div>
              <div className="text-text-hi">
                {infoTask.context_device ?? "any"}
              </div>
              <div>Where</div>
              <div className="text-text-hi">
                {infoTask.context_where ?? "any"}
              </div>
              <div>Energy</div>
              <div className="text-text-hi">
                {infoTask.context_energy ?? "any"}
              </div>
              <div>Due</div>
              <div className="text-text-hi">
                {infoTask.due_date
                  ? new Date(infoTask.due_date).toLocaleDateString("en-GB")
                  : "—"}
              </div>
              <div>Urgency</div>
              <div className="text-text-hi">
                {infoTask.urgency ?? "—"}
              </div>
            </div>
            <div className="text-[12px] text-text-lo italic mt-2">
              Score = number of context fields matching your current
              where/device/energy/tag.
            </div>
          </div>
        ) : null}
      </Sheet>
    </Surface>
  );
}
