"use client";

import { useState } from "react";
import Link from "next/link";
import { Surface, Button, Label } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import { triggerFieldPulse } from "@/lib/motion";
import { STATUS_COLOURS, type Step, type Venture } from "@/lib/ventures/types";

const KIND_ICONS: Record<string, string> = {
  organisation: "🏢",
  business: "💼",
  store: "🏪",
  project: "📂",
  idea: "💡",
};

type StepsPayload = { steps: Step[] };

function daysSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const now = Date.now();
  const diffDays = Math.floor((now - then) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day";
  if (diffDays < 14) return `${diffDays} days`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 8) return `${weeks} weeks`;
  const months = Math.floor(diffDays / 30);
  return `${months} months`;
}

/**
 * A single row in the This Week overview. Owns its own steps fetch so the
 * parent doesn't need N+1 hooks-in-loop tricks — SWR dedupes and caches.
 * "Days since" uses the most recent activity signal we have without an
 * extra fetch — the venture row's own updated_at (falling back to
 * created_at). Aggregating with steps/ads updated_at would need a heavier
 * endpoint; see the P3 report for the trade-off.
 */
export function VentureRow({
  venture,
}: {
  venture: Venture & { updated_at?: string; created_at?: string };
}) {
  const stepsKey = `/api/ventures/${venture.id}/steps`;
  const { data, isLoading } = useApi<StepsPayload>(stepsKey);
  const steps = data?.steps ?? [];
  const nextStep = steps
    .filter((s) => s.status !== "done")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];

  const [newTitle, setNewTitle] = useState("");
  const [defining, setDefining] = useState(false);

  const activitySignal =
    venture.updated_at ?? venture.created_at ?? null;

  async function markDone() {
    if (!nextStep) return;
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: (current?.steps ?? []).map((s) =>
          s.id === nextStep.id ? { ...s, status: "done" } : s,
        ),
      }),
      async () => {
        const res = await fetch(
          `/api/ventures/${venture.id}/steps/${nextStep.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done" }),
          },
        );
        if (!res.ok) throw new Error(`step update failed (${res.status})`);
        triggerFieldPulse(
          window.innerWidth / 2,
          window.innerHeight - 40,
        );
      },
    );
  }

  async function defineStep() {
    const title = newTitle.trim();
    if (!title) return;
    const optimisticId = `optimistic-${Date.now()}`;
    setNewTitle("");
    setDefining(false);
    await mutateApi<StepsPayload>(
      stepsKey,
      (current) => ({
        steps: [
          ...(current?.steps ?? []),
          {
            id: optimisticId,
            venture_id: venture.id,
            title,
            description: null,
            status: "todo",
            linked_task_id: null,
            sort_order: 1,
          },
        ],
      }),
      async () => {
        const res = await fetch(`/api/ventures/${venture.id}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error(`step create failed (${res.status})`);
      },
    );
  }

  const statusChip =
    STATUS_COLOURS[venture.status] ?? "bg-surface-2 text-text-lo";

  return (
    <Surface level={1} className="p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-lg leading-none mt-0.5 shrink-0">
          {KIND_ICONS[venture.kind] ?? "📋"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/ventures/${venture.id}`}
              className="text-sm font-medium text-text-hi hover:text-glow transition-colors truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {venture.name}
            </Link>
            <span
              className={`text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-v2-sm font-[family-name:var(--font-jetbrains-mono)] ${statusChip}`}
            >
              {venture.status}
            </span>
            <Mono className="ml-auto text-[10px] text-text-lo shrink-0">
              {daysSince(activitySignal)}
            </Mono>
          </div>

          {isLoading ? (
            <div className="mt-2 h-4 w-32 bg-surface-2 rounded-v2-sm animate-pulse" />
          ) : nextStep ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[13px] text-text-mid flex-1 min-w-0 truncate">
                <Label>Next</Label> · {nextStep.title}
              </span>
              <Button size="sm" variant="primary" onClick={markDone}>
                Do it
              </Button>
            </div>
          ) : defining ? (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void defineStep();
                  if (e.key === "Escape") {
                    setDefining(false);
                    setNewTitle("");
                  }
                }}
                placeholder="Next step…"
                className="flex-1 bg-surface-0 border border-hairline rounded-v2-sm text-sm text-text-hi px-2 py-1.5 outline-none focus:border-glow"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDefining(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={defineStep}>
                Add
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDefining(true)}
              className="mt-2 text-[13px] text-text-lo hover:text-text-hi transition-colors italic"
            >
              Define the next step →
            </button>
          )}
        </div>
      </div>
    </Surface>
  );
}

export { daysSince };
