"use client";

import { useCallback, useEffect, useState } from "react";

type EntityType = "person" | "project" | "workout" | "food";

type Rule = {
  id: string;
  entity_type: EntityType;
  review_new: boolean;
  review_low_confidence: boolean;
  auto_create_threshold: number;
};

const TYPE_LABEL: Record<EntityType, string> = {
  person: "People",
  project: "Projects",
  workout: "Workouts",
  food: "Foods",
};

const TYPE_DESCRIPTION: Record<EntityType, string> = {
  person:
    "A voice/Telegram capture mentions a name we don't recognise. Review before auto-creating a new person.",
  project:
    "A capture references a project we haven't seen. Review before linking it to a fresh project.",
  workout:
    "An ad-hoc workout name appears in a voice log. Off by default — most workouts live in the library.",
  food:
    "A food name comes through but isn't in your library or OFF. Off by default — the food search flow handles this.",
};

const DEFAULT_TYPES: EntityType[] = ["person", "project", "workout", "food"];

export function EntityRulesClient() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/entity-rules", { cache: "no-store" });
      if (!r.ok) {
        setError(`Load failed (${r.status})`);
        return;
      }
      const j = (await r.json()) as { rules?: Rule[] };
      setRules(Array.isArray(j.rules) ? j.rules : []);
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function patch(type: EntityType, patch: Partial<Rule>) {
    setRules((cur) =>
      (cur ?? []).map((r) =>
        r.entity_type === type ? { ...r, ...patch } : r,
      ),
    );
    try {
      await fetch("/api/entity-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: type, ...patch }),
      });
    } catch {
      // Re-load on error to reconcile
      void load();
    }
  }

  // Merge defaults with loaded rules so a missing seed shows the toggles.
  const byType = new Map<EntityType, Rule>();
  for (const r of rules ?? []) byType.set(r.entity_type, r);
  const merged: Rule[] = DEFAULT_TYPES.map((t) =>
    byType.get(t) ?? {
      id: t,
      entity_type: t,
      review_new: t === "person" || t === "project",
      review_low_confidence: t === "person" || t === "project",
      auto_create_threshold: 0,
    },
  );

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Entity review rules
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          When a voice or Telegram capture mentions something new, decide
          whether to pause for review or auto-create on the spot.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {merged.map((r) => (
          <li
            key={r.entity_type}
            className="rounded-md bg-ink-1 border border-ink-2 px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-base text-ink-4">
                {TYPE_LABEL[r.entity_type]}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {r.entity_type}
              </span>
            </div>
            <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              {TYPE_DESCRIPTION[r.entity_type]}
            </p>
            <div className="flex items-center gap-4 flex-wrap mt-1">
              <label className="flex items-center gap-2 text-sm text-ink-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.review_new}
                  onChange={(e) =>
                    void patch(r.entity_type, { review_new: e.target.checked })
                  }
                  className="accent-accent"
                />
                Review when new
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.review_low_confidence}
                  onChange={(e) =>
                    void patch(r.entity_type, {
                      review_low_confidence: e.target.checked,
                    })
                  }
                  className="accent-accent"
                />
                Review on low confidence
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-4">
                Auto-create after
                <input
                  type="number"
                  min={0}
                  value={r.auto_create_threshold}
                  onChange={(e) =>
                    void patch(r.entity_type, {
                      auto_create_threshold: Number(e.target.value) || 0,
                    })
                  }
                  className="w-16 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
                />
                mentions
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
