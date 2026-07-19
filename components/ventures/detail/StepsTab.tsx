"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import {
  STEP_STATUS_CYCLE,
  STEP_STATUS_ICONS,
  type Step,
  type Venture,
} from "@/lib/ventures/types";
import { mutateApi } from "@/lib/data/mutateApi";

type StepsPayload = { steps: Step[] };

export function StepsTab({
  ventureId,
  steps,
  stepsKey,
}: {
  ventureId: string;
  steps: Step[];
  stepsKey: string;
}) {
  const [newTitle, setNewTitle] = useState("");
  const done = steps.filter((s) => s.status === "done").length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  async function addStep() {
    const title = newTitle.trim();
    if (!title) return;
    // Capture id + sort_order outside the optimistic updater — the updater
    // runs during render and React 19 forbids Date.now()/Math.random() there.
    const optimisticId = `optimistic-${Date.now()}`;
    const nextSortOrder =
      Math.max(0, ...steps.map((s) => s.sort_order ?? 0)) + 1;
    setNewTitle("");
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: [
          ...(current?.steps ?? []),
          {
            id: optimisticId,
            venture_id: ventureId,
            title,
            description: null,
            status: "todo",
            linked_task_id: null,
            sort_order: nextSortOrder,
          },
        ],
      }),
      async () => {
        const res = await fetch(`/api/ventures/${ventureId}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error(`step create failed (${res.status})`);
      },
    );
  }

  async function toggleStatus(step: Step) {
    const next = STEP_STATUS_CYCLE[step.status] ?? "todo";
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: (current?.steps ?? []).map((s) =>
          s.id === step.id ? { ...s, status: next } : s,
        ),
      }),
      async () => {
        const res = await fetch(
          `/api/ventures/${ventureId}/steps/${step.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          },
        );
        if (!res.ok) throw new Error(`step update failed (${res.status})`);
      },
    );
  }

  async function deleteStep(stepId: string) {
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: (current?.steps ?? []).filter((s) => s.id !== stepId),
      }),
      async () => {
        const res = await fetch(
          `/api/ventures/${ventureId}/steps/${stepId}`,
          { method: "DELETE" },
        );
        if (!res.ok && res.status !== 404) {
          throw new Error(`step delete failed (${res.status})`);
        }
      },
    );
  }

  async function createAsTask(step: Step) {
    // Look up venture name for prefix. Reads from the same allVentures SWR
    // cache that the controller populates — this raw fetch here is a fine
    // one-shot lookup; it doesn't need optimistic treatment.
    let ventureName = "";
    try {
      const r = await fetch("/api/ventures");
      if (r.ok) {
        const j = (await r.json()) as { ventures?: Venture[] };
        ventureName = j.ventures?.find((v) => v.id === ventureId)?.name ?? "";
      }
    } catch {
      /* non-fatal */
    }
    const taskRes = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[${ventureName}] ${step.title}`,
        description: step.description || undefined,
        urgency: "someday",
      }),
    });
    if (!taskRes.ok) return;
    const taskData = (await taskRes.json()) as { task?: { id?: string }; id?: string };
    const taskId = taskData.task?.id ?? taskData.id;
    if (!taskId) return;
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: (current?.steps ?? []).map((s) =>
          s.id === step.id ? { ...s, linked_task_id: taskId } : s,
        ),
      }),
      async () => {
        const res = await fetch(
          `/api/ventures/${ventureId}/steps/${step.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linked_task_id: taskId }),
          },
        );
        if (!res.ok) throw new Error(`step link failed (${res.status})`);
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {steps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Mono className="text-[10px] text-ink-3">
              {done}/{steps.length} complete
            </Mono>
            <Mono className="text-[10px] text-ink-3">{pct}%</Mono>
          </div>
          <div className="h-1.5 bg-ink-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-ok rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {steps.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 py-2 px-3 rounded-md bg-ink-1 hover:bg-ink-2/60 group transition-colors"
          >
            <button
              type="button"
              onClick={() => toggleStatus(s)}
              className={`text-base shrink-0 ${
                s.status === "done"
                  ? "text-ok"
                  : s.status === "in_progress"
                    ? "text-info"
                    : "text-ink-3"
              }`}
            >
              {STEP_STATUS_ICONS[s.status] ?? "○"}
            </button>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm ${
                  s.status === "done"
                    ? "text-ink-3 line-through"
                    : "text-text-0"
                }`}
              >
                {s.title}
              </div>
              {s.description && (
                <div className="text-xs text-ink-3 mt-0.5">
                  {s.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!s.linked_task_id && (
                <button
                  type="button"
                  onClick={() => createAsTask(s)}
                  className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-[0.1em] px-1.5 py-0.5"
                >
                  → TASK
                </button>
              )}
              {s.linked_task_id && (
                <Link
                  href={`/organisation/tasks?task=${s.linked_task_id}`}
                  className="text-[9px] text-ok hover:underline font-[family-name:var(--font-mono)] tracking-[0.1em] px-1.5 py-0.5"
                >
                  LINKED →
                </Link>
              )}
              <button
                type="button"
                onClick={() => deleteStep(s.id)}
                className="text-[9px] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)] px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New step…"
          className="flex-1 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && addStep()}
        />
        <button
          type="button"
          onClick={addStep}
          disabled={!newTitle.trim()}
          className="px-3 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] disabled:opacity-40"
        >
          ADD
        </button>
      </div>
    </div>
  );
}
