"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useApi, ApiError } from "@/lib/data/useApi";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  URGENCIES,
  URGENCY_LABEL,
  type Task,
  type TaskComment,
  type TaskActivity,
  type TaskStatus,
  type TaskUrgency,
} from "@/lib/types/task";

// Part B, first increment: a routed ticket page addressed by key
// (/organisation/tickets/MYC-33). Reads via /api/tickets/[key] through the
// shared SWR cache; writes go through the /api/tasks/[id] compatibility
// routes by id and then revalidate this key. The richer Now view and GTD
// tabs land in later Part B increments.

type Payload = { task: Task; comments: TaskComment[]; activity: TaskActivity[] };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TicketPage() {
  const params = useParams<{ key: string }>();
  const ticketKey = params.key;
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");

  // SWR owns the fetch lifecycle — no useEffect, so no set-state-in-effect.
  // The key is the raw path, so any other surface reading this ticket shares
  // the same cache entry. mutate() re-reads it after a write.
  const { data, error, mutate } = useApi<Payload>(
    `/api/tickets/${encodeURIComponent(ticketKey)}`,
  );

  const patch = useCallback(
    async (fields: Partial<Pick<Task, "title" | "description" | "status" | "urgency">>) => {
      if (!data) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/tasks/${data.task.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (res.ok) await mutate();
      } finally {
        setSaving(false);
      }
    },
    [data, mutate],
  );

  const addComment = useCallback(async () => {
    if (!data || !comment.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${data.task.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      if (res.ok) {
        setComment("");
        await mutate();
      }
    } finally {
      setSaving(false);
    }
  }, [data, comment, mutate]);

  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/organisation/tasks" className="text-xs text-glow-2 hover:underline">
          ← All tickets
        </Link>
        <p className="mt-6 text-sm text-ink-3">
          {status === 404
            ? "No ticket with that key in your spaces."
            : "Could not load this ticket."}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-3">Loading {ticketKey}…</div>
    );
  }

  const t = data.task;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/organisation/tasks" className="text-xs text-glow-2 hover:underline">
          ← All tickets
        </Link>
        <span className="text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink-3">
          {t.ticket_key ?? "—"}
          {saving && <span className="ml-2 text-ink-3">saving…</span>}
        </span>
      </div>

      <input
        className="mt-4 w-full bg-transparent text-2xl font-semibold text-text-0 outline-none focus:border-b focus:border-glow-2/60"
        defaultValue={t.title}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== t.title) void patch({ title: v });
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Status</span>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.status}
            onChange={(e) => void patch({ status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Urgency</span>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.urgency ?? "someday"}
            onChange={(e) => void patch({ urgency: e.target.value as TaskUrgency })}
          >
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Project</span>
          <span className="text-ink-4">{t.project_name ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Created</span>
          <span className="text-ink-4">{fmtDate(t.created_at)}</span>
        </div>
      </div>

      <div className="mt-6">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Description</span>
        <textarea
          className="mt-1 min-h-[100px] w-full rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none focus:ring-2 focus:ring-glow-2/60"
          defaultValue={t.description ?? ""}
          placeholder="Add a description…"
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (t.description ?? "")) void patch({ description: v || null });
          }}
        />
      </div>

      <div className="mt-8">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Comments</span>
        <ul className="mt-2 space-y-2">
          {data.comments.length === 0 && (
            <li className="text-sm text-ink-3">No comments yet.</li>
          )}
          {data.comments.map((c) => (
            <li key={c.id} className="rounded-sm bg-ink-2 px-3 py-2 text-sm text-ink-4">
              <p className="whitespace-pre-wrap">{c.body}</p>
              <span className="mt-1 block text-[11px] text-ink-3">{fmtDate(c.created_at)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none focus:ring-2 focus:ring-glow-2/60"
            value={comment}
            placeholder="Add a comment…"
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addComment();
            }}
          />
          <button
            type="button"
            onClick={() => void addComment()}
            disabled={!comment.trim() || saving}
            className="rounded-sm bg-glow-2/20 px-3 py-2 text-sm text-glow-2 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {data.activity.length > 0 && (
        <div className="mt-8">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Activity</span>
          <ul className="mt-2 space-y-1 text-xs text-ink-3">
            {data.activity.map((a) => (
              <li key={a.id}>
                {a.action}
                {a.field ? ` · ${a.field}` : ""} · {fmtDate(a.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
