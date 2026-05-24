"use client";

import { useEffect, useState } from "react";
import type { Habit } from "@/lib/config/habits";

function slugId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "habit";
  let id = base;
  let n = 2;
  while (existing.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

type Draft = Habit & { __new?: boolean };

export function HabitsConfigModal({
  habits,
  onClose,
  onSaved,
}: {
  habits: Habit[];
  onClose: () => void;
  onSaved: (next: Habit[]) => void;
}) {
  const [draft, setDraft] = useState<Draft[]>(() =>
    habits.map((h) => ({ ...h }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(idx: number, patchObj: Partial<Habit>) {
    setDraft((cur) =>
      cur.map((h, i) => (i === idx ? { ...h, ...patchObj } : h))
    );
  }

  function add() {
    const ids = new Set(draft.map((h) => h.id));
    setDraft((cur) => [
      ...cur,
      {
        id: slugId("new-habit", ids),
        name: "",
        category: "BODY",
        target: undefined,
        unit: undefined,
        __new: true,
      },
    ]);
  }

  function remove(idx: number) {
    setDraft((cur) => cur.filter((_, i) => i !== idx));
  }

  async function save() {
    if (saving) return;
    // For brand-new habits with an empty/placeholder id, regenerate from name
    const ids = new Set<string>();
    const cleaned: Habit[] = [];
    for (const d of draft) {
      const name = d.name.trim();
      if (!name) continue; // skip empty rows
      let id = d.id;
      if (d.__new) {
        id = slugId(name, ids);
      }
      if (ids.has(id)) continue; // dedup
      ids.add(id);
      const out: Habit = {
        id,
        name,
        category: d.category.trim() || "OTHER",
      };
      if (typeof d.target === "number" && Number.isFinite(d.target)) {
        out.target = d.target;
      }
      if (typeof d.unit === "string" && d.unit.trim()) {
        out.unit = d.unit.trim();
      }
      cleaned.push(out);
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/habits-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habits: cleaned }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        habits?: Habit[];
        error?: string;
      };
      if (!res.ok || !j.habits) {
        setError(j.error ?? `Save failed (${res.status})`);
        return;
      }
      onSaved(j.habits);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-ink-2 bg-ink-1 shadow-2xl flex flex-col max-h-[80vh]"
        role="dialog"
        aria-label="Manage habits"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Manage Habits
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-4 text-sm"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {error && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
              ⚠ {error}
            </div>
          )}

          <div className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] pb-1">
            <span>Name</span>
            <span>Category</span>
            <span>Target</span>
            <span>Unit</span>
            <span />
          </div>

          {draft.length === 0 ? (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
              No habits configured. Add one below.
            </div>
          ) : (
            draft.map((h, idx) => (
              <div
                key={`${h.id}-${idx}`}
                className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 items-center"
              >
                <input
                  type="text"
                  value={h.name}
                  onChange={(e) => patch(idx, { name: e.target.value })}
                  placeholder="Move"
                  className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
                />
                <input
                  type="text"
                  value={h.category}
                  onChange={(e) => patch(idx, { category: e.target.value })}
                  placeholder="BODY"
                  className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] text-[11px]"
                />
                <input
                  type="number"
                  value={h.target ?? ""}
                  onChange={(e) =>
                    patch(idx, {
                      target: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="—"
                  className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
                />
                <input
                  type="text"
                  value={h.unit ?? ""}
                  onChange={(e) =>
                    patch(idx, {
                      unit: e.target.value === "" ? undefined : e.target.value,
                    })
                  }
                  placeholder="—"
                  className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label="Delete habit"
                  className="text-ink-3 hover:text-danger transition-colors text-base leading-none"
                >
                  ×
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={add}
            className="self-start text-[11px] uppercase tracking-[0.18em] text-accent hover:text-ink-4 font-[family-name:var(--font-mono)] mt-1"
          >
            + add habit
          </button>

          <p className="mt-3 text-[10px] text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
            Ids are stable. Renaming a habit keeps history intact; deleting one
            leaves historical &quot;done&quot; entries pointing at a ghost id
            (harmless, just hidden).
          </p>
        </div>

        <footer className="border-t border-ink-2 px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-ink-2 text-sm text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
