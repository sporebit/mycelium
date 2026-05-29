"use client";

import { useEffect, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { GoalItem, GoalScope } from "@/lib/types/goals";
import type { CardWidth } from "@/lib/dashboard/card-registry";

type Goals = { week: GoalItem[]; month: GoalItem[] };

function newGoal(text: string): GoalItem {
  return {
    id: crypto.randomUUID(),
    text,
    done: false,
    created_at: new Date().toISOString(),
  };
}

export function Goals({ width = 1 }: { width?: CardWidth } = {}) {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/goals")
      .then((r) => r.json())
      .then((j: Partial<Goals>) => {
        if (!mounted) return;
        setGoals({
          week: Array.isArray(j?.week) ? j.week : [],
          month: Array.isArray(j?.month) ? j.month : [],
        });
      })
      .catch(() => mounted && setGoals({ week: [], month: [] }));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function persist(scope: GoalScope, items: GoalItem[]): Promise<boolean> {
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, items }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function updateScope(scope: GoalScope, items: GoalItem[]) {
    if (!goals) return;
    const prev = goals;
    setGoals({ ...goals, [scope]: items });
    const ok = await persist(scope, items);
    if (!ok) {
      setGoals(prev);
      setError("Save failed");
    }
  }

  function addGoal(scope: GoalScope, text: string) {
    if (!goals) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    void updateScope(scope, [...goals[scope], newGoal(trimmed)]);
  }

  function toggle(scope: GoalScope, id: string) {
    if (!goals) return;
    const next = goals[scope].map((g) =>
      g.id === id ? { ...g, done: !g.done } : g
    );
    void updateScope(scope, next);
  }

  function remove(scope: GoalScope, id: string) {
    if (!goals) return;
    void updateScope(scope, goals[scope].filter((g) => g.id !== id));
  }

  const totalAll = (goals?.week?.length ?? 0) + (goals?.month?.length ?? 0);
  const doneAll =
    (goals?.week?.filter((g) => g.done).length ?? 0) +
    (goals?.month?.filter((g) => g.done).length ?? 0);
  const pctAll = totalAll === 0 ? 0 : Math.round((doneAll / totalAll) * 100);

  return (
    <Panel borderless title="GOALS">
      {error && (
        <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {totalAll > 0 && (
        <div className="mb-4 flex flex-col gap-0.5">
          <span className="card-eyebrow">Progress</span>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="font-[family-name:var(--font-display)] text-3xl font-medium text-text-0 leading-none">
              {pctAll}%
            </span>
            <span className="text-sm text-text-1">
              {doneAll} of {totalAll} {totalAll === 1 ? "goal" : "goals"}
            </span>
          </div>
        </div>
      )}

      {width >= 3 ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Section
            label="This Week"
            emptyText="No weekly goals yet. Add one below."
            items={goals?.week ?? null}
            onAdd={(t) => addGoal("week", t)}
            onToggle={(id) => toggle("week", id)}
            onRemove={(id) => remove("week", id)}
          />
          <Section
            label="This Month"
            emptyText="No monthly goals yet. Add one below."
            items={goals?.month ?? null}
            onAdd={(t) => addGoal("month", t)}
            onToggle={(id) => toggle("month", id)}
            onRemove={(id) => remove("month", id)}
          />
        </div>
      ) : (
        <>
          <Section
            label="This Week"
            emptyText="No weekly goals yet. Add one below."
            items={goals?.week ?? null}
            onAdd={(t) => addGoal("week", t)}
            onToggle={(id) => toggle("week", id)}
            onRemove={(id) => remove("week", id)}
          />
          <div className="my-4 border-t border-ink-2" />
          <Section
            label="This Month"
            emptyText="No monthly goals yet. Add one below."
            items={goals?.month ?? null}
            onAdd={(t) => addGoal("month", t)}
            onToggle={(id) => toggle("month", id)}
            onRemove={(id) => remove("month", id)}
          />
        </>
      )}
    </Panel>
  );
}

function Section({
  label,
  emptyText,
  items,
  onAdd,
  onToggle,
  onRemove,
}: {
  label: string;
  emptyText: string;
  items: GoalItem[] | null;
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const completed = (items ?? []).filter((g) => g.done).length;
  const total = items?.length ?? 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {label}
        </span>
        {items !== null && total > 0 && (
          <Mono className="text-[10px] text-ink-3">
            {completed}/{total}
          </Mono>
        )}
      </div>

      <ul className="flex flex-col">
        {items === null ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
            Loading…
          </li>
        ) : items.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
            {emptyText}
          </li>
        ) : (
          items.map((g) => (
            <li
              key={g.id}
              className="group flex items-center gap-2 py-1"
            >
              <button
                type="button"
                onClick={() => onToggle(g.id)}
                aria-label={g.done ? "Mark not done" : "Mark done"}
                className={`h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center text-[10px] leading-none transition-colors ${
                  g.done
                    ? "border-accent bg-accent text-ink-0"
                    : "border-ink-3 hover:border-ink-4"
                }`}
              >
                {g.done && "✓"}
              </button>
              <span
                className={`flex-1 text-sm leading-snug min-w-0 break-words ${
                  g.done ? "text-ink-3 line-through" : "text-ink-4"
                }`}
              >
                {g.text}
              </span>
              <button
                type="button"
                onClick={() => onRemove(g.id)}
                aria-label="Delete"
                className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger transition-opacity text-sm shrink-0"
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={submit} className="flex items-center gap-2 mt-1">
        <span className="text-ink-3 text-sm shrink-0">+</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="add a goal"
          className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)] border-b border-transparent focus:border-ink-2 transition-colors pb-0.5"
        />
      </form>
    </div>
  );
}
