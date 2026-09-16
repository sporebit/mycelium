"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  URGENCY_LABEL,
  type Task,
} from "@/lib/types/task";
import {
  GTD_BUCKETS,
  bucketCounts,
  inBucket,
  type GtdBucket,
} from "@/lib/tickets/gtd";

// Part B: the GTD home at /organisation/tickets. A read-first lens that
// derives GTD buckets from the fields Phil edits today (see lib/tickets/gtd).
// Rows link to the key-addressed ticket page (increment 1) for editing, so
// this page never mutates and can't disturb the /organisation/tasks daily
// driver. The Now score, chip row and Clarify stack land in later increments.

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function TicketRow({ t }: { t: Task }) {
  const tone = TASK_STATUS_TONE[t.status];
  const href = t.ticket_key
    ? `/organisation/tickets/${t.ticket_key}`
    : `/organisation/tasks?task=${t.id}`;
  const date = t.due_date ?? (t.scheduled_at ? t.scheduled_at.slice(0, 10) : null);
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-v2-md border border-hairline bg-surface-1 px-3 py-2 transition-colors hover:bg-surface-2"
      >
        <span className="w-[68px] shrink-0 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] text-glow-2">
          {t.ticket_key ?? "—"}
        </span>
        <span
          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] ${tone.fg} ${tone.bg} ${tone.border}`}
        >
          {TASK_STATUS_LABEL[t.status]}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            t.completed_at ? "text-ink-3 line-through" : "text-ink-4"
          }`}
        >
          {t.title}
        </span>
        {t.project_name && (
          <span className="hidden shrink-0 truncate text-[11px] text-ink-3 sm:inline max-w-[140px]">
            {t.project_name}
          </span>
        )}
        {t.urgency && t.urgency !== "someday" && (
          <span className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] text-ink-3 md:inline">
            {URGENCY_LABEL[t.urgency]}
          </span>
        )}
        {date && (
          <span className="shrink-0 text-[11px] font-[family-name:var(--font-mono)] text-ink-3">
            {fmtDate(date)}
          </span>
        )}
      </Link>
    </li>
  );
}

export default function TicketsGtdPage() {
  const [bucket, setBucket] = useState<GtdBucket>("today");
  const { data, error } = useApi<{ tasks?: Task[] }>(
    "/api/tasks?status=open&include_completed=true",
  );

  const tasks = useMemo<Task[]>(
    () => (Array.isArray(data?.tasks) ? data.tasks : []),
    [data],
  );
  const counts = useMemo(() => bucketCounts(tasks), [tasks]);
  const visible = useMemo(
    () =>
      tasks.filter((t) => !t.parent_task_id && inBucket(t, bucket)),
    [tasks, bucket],
  );
  const activeHint = GTD_BUCKETS.find((b) => b.id === bucket)?.hint ?? "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-text-0">Tickets</h1>
        <Link
          href="/organisation/tasks"
          className="text-xs text-glow-2 hover:underline"
        >
          Classic view →
        </Link>
      </div>

      {/* Tab row */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {GTD_BUCKETS.map((b) => {
          const active = b.id === bucket;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucket(b.id)}
              aria-pressed={active}
              title={b.hint}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-[0.14em] transition-colors ${
                active
                  ? "border-glow-2/50 bg-glow-2/15 text-glow-2"
                  : "border-ink-2 bg-ink-0/40 text-ink-3 hover:border-ink-3 hover:text-ink-4"
              }`}
            >
              {b.label}
              <span className="ml-1.5 text-ink-3">{counts[b.id]}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-ink-3">{activeHint}</p>

      {/* Body */}
      <div className="mt-4">
        {error ? (
          <p className="text-sm text-ink-3">Could not load tickets.</p>
        ) : !data ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
            <p className="text-sm italic text-ink-3">Nothing in {GTD_BUCKETS.find((b) => b.id === bucket)?.label}.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((t) => (
              <TicketRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
