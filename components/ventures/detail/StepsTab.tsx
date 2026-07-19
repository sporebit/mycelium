"use client";

import { useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import {
  STEP_STATUS_CYCLE,
  STEP_STATUS_ICONS,
  type Step,
  type Venture,
} from "@/lib/ventures/types";

export function StepsTab({
  ventureId,
  steps,
  onReload,
}: {
  ventureId: string;
  steps: Step[];
  onReload: () => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const done = steps.filter((s) => s.status === "done").length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  async function addStep() {
    if (!newTitle.trim()) return;
    await fetch(`/api/ventures/${ventureId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    onReload();
  }

  async function toggleStatus(step: Step) {
    const next = STEP_STATUS_CYCLE[step.status] ?? "todo";
    await fetch(`/api/ventures/${ventureId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    onReload();
  }

  async function deleteStep(stepId: string) {
    await fetch(`/api/ventures/${ventureId}/steps/${stepId}`, {
      method: "DELETE",
    });
    onReload();
  }

  async function createAsTask(step: Step) {
    const r = await fetch("/api/ventures", { cache: "no-store" });
    let ventureName = "";
    if (r.ok) {
      const j = await r.json();
      const v = (j.ventures as Venture[])?.find((v) => v.id === ventureId);
      ventureName = v?.name ?? "";
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
    if (taskRes.ok) {
      const taskData = await taskRes.json();
      const taskId = taskData.task?.id ?? taskData.id;
      if (taskId) {
        await fetch(`/api/ventures/${ventureId}/steps/${step.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linked_task_id: taskId }),
        });
      }
    }
    onReload();
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
                <Mono className="text-[9px] text-ok">LINKED</Mono>
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
