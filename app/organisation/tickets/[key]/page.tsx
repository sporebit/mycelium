"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { useApi, ApiError } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import {
  CATEGORY_LABEL,
  SIMPLE_BUCKETS,
  SIMPLE_BUCKET_LABEL,
  SIMPLE_BUCKET_TARGET,
  TICKET_CATEGORIES,
  TICKET_KINDS,
  simpleBucketOf,
  type TicketCategory,
} from "@/lib/tickets/categories";
import {
  URGENCIES,
  URGENCY_LABEL,
  type Task,
  type TaskComment,
  type TaskActivity,
  type TaskUrgency,
} from "@/lib/types/task";
import { CategoryChip } from "@/components/tickets/CategoryChip";
import { ContextEditor, Pill, contextOf, type ContextValue } from "@/components/tickets/ContextEditor";
import { StepsSection } from "@/components/tickets/StepsSection";
import { TicketListRow, fmtDay } from "@/components/tickets/TicketListRow";
import { personLabel, ticketFetch, usePeople, useProjects } from "@/components/tickets/pickers";

// Part B: the ticket page (spec §12) addressed by key. Reads
// /api/tickets/[key] through SWR; every write goes to /api/tickets/[key]
// (PATCH), /move, /complete, /verify, /links or /comments, then revalidates
// this key and the lists. Status is a *category* move; the 0117 trigger keeps
// the classic view's legacy status in step.

type TicketLink = {
  id: string;
  kind: string;
  ref: string | null;
  url: string | null;
  label: string | null;
  at: string;
};
type Payload = {
  task: Task & { blocked_by?: string[] };
  sub_tasks: Array<Task & { blocked_by?: string[] }>;
  links: TicketLink[];
  completions: string[];
  comments: TaskComment[];
  activity: TaskActivity[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{children}</span>;
}

function revalidateLists() {
  void globalMutate("/api/tickets/counts");
  void globalMutate("/api/tickets/clarify");
  void globalMutate((k) => typeof k === "string" && k.startsWith("/api/tickets?"), undefined, {
    revalidate: true,
  });
}

export default function TicketPage() {
  const params = useParams<{ key: string }>();
  const ticketKey = params.key;
  const apiKey = `/api/tickets/${encodeURIComponent(ticketKey)}`;
  const { data, error, mutate } = useApi<Payload>(apiKey);
  const { prefs } = useUiPrefs();
  const simple = ticketPrefs(prefs).simple_statuses;
  const projects = useProjects();
  const people = usePeople();
  const { data: assigneeData } = useApi<{ assignees: Array<{ id: string; display_name: string | null; me: boolean }> }>("/api/tickets/assignees");
  const assignees = assigneeData?.assignees ?? [];

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  async function run(fn: () => Promise<unknown>, opts: { lists?: boolean } = {}) {
    setSaving(true);
    setErr(null);
    try {
      await fn();
      await mutate();
      if (opts.lists !== false) revalidateLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setSaving(false);
    }
  }

  const patch = (fields: Record<string, unknown>) =>
    run(() => ticketFetch(apiKey, { method: "PATCH", body: fields }));
  const move = (category: TicketCategory, extra: Record<string, unknown> = {}) =>
    run(() => ticketFetch(`${apiKey}/move`, { method: "POST", body: { category, ...extra } }));

  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/organisation/tickets" className="text-xs text-glow-2 hover:underline">
          ← Tickets
        </Link>
        <p className="mt-6 text-sm text-ink-3">
          {status === 404 ? "No ticket with that key in your spaces." : "Could not load this ticket."}
        </p>
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-3">Loading {ticketKey}…</div>;
  }

  const t = data.task;
  const cat = t.category ?? null;
  const closed = cat === "done" || cat === "cancelled";
  const ctx: ContextValue = contextOf(t);
  const saveCtx = (next: ContextValue) =>
    patch({
      where_ctx: next.where_ctx,
      tools: next.tools,
      time_window: next.time_window,
      time_from: next.time_window === "custom" ? next.time_from ?? null : null,
      time_to: next.time_window === "custom" ? next.time_to ?? null : null,
      days: next.time_window === "custom" ? next.days ?? null : null,
      points: next.points,
    });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/organisation/tickets" className="text-glow-2 hover:underline">
            ← Tickets
          </Link>
          {t.project_name && (
            <span className="text-ink-3">
              / {t.project_name}
            </span>
          )}
          {t.parent_task_id && (
            <span className="text-ink-3">/ sub-task</span>
          )}
        </div>
        <span className="text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink-3">
          {t.ticket_key ?? "—"}
          {saving && <span className="ml-2">saving…</span>}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <CategoryChip category={cat} name={t.status_name} simple={simple} />
        {t.urgent && <span className="text-warn" title="Urgent">!</span>}
        {t.someday && <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">someday</span>}
        {t.verified_at && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-ok" title={`Verified live ${fmtDate(t.verified_at)}`}>
            ✓ verified
          </span>
        )}
        {(t.blocked_by?.length ?? 0) > 0 && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-warn">
            blocked by {t.blocked_by?.join(", ")}
          </span>
        )}
      </div>

      <input
        className="mt-3 w-full bg-transparent text-2xl font-semibold text-text-0 outline-none focus:border-b focus:border-glow-2/60"
        defaultValue={t.title}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== t.title) void patch({ title: v });
        }}
      />

      {/* Status moves */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Label>Status</Label>
        {simple
          ? SIMPLE_BUCKETS.map((b) => (
              <Pill
                key={b}
                active={cat != null && simpleBucketOf(cat) === b}
                onClick={() => void move(SIMPLE_BUCKET_TARGET[b])}
              >
                {SIMPLE_BUCKET_LABEL[b]}
              </Pill>
            ))
          : TICKET_CATEGORIES.map((c) => (
              <Pill key={c} active={cat === c} onClick={() => void move(c)} tone={c === "done" ? "accent" : "glow"}>
                {CATEGORY_LABEL[c]}
              </Pill>
            ))}
        {cat === "done" && !t.verified_at && (
          <button
            type="button"
            onClick={() => run(() => ticketFetch(`${apiKey}/verify`, { method: "POST", body: {} }))}
            className="ml-2 rounded-sm bg-ok/15 px-2.5 py-1 text-[11px] text-ok"
            title="Phil's live check — separate from automation's evidence-backed Done"
          >
            Verified live
          </button>
        )}
        {cat === "done" && t.verified_at && (
          <button
            type="button"
            onClick={() => run(() => ticketFetch(`${apiKey}/verify`, { method: "POST", body: { verified: false } }))}
            className="ml-2 text-[11px] text-ink-3 hover:text-ink-4"
          >
            unverify
          </button>
        )}
      </div>

      {/* Assignee (spec §10, Part H): the caller plus team members */}
      {(assignees.length > 1 || t.assignee_id) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Label>Assignee</Label>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0"
            value={t.assignee_id ?? ""}
            onChange={(e) => void patch({ assignee_id: e.target.value || null })}
          >
            <option value="">— unassigned —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
                {a.me ? " (me)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {cat === "waiting" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Label>Waiting on</Label>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0"
            value={t.waiting_on_person_id ?? ""}
            onChange={(e) => void patch({ waiting_on_person_id: e.target.value || null })}
          >
            <option value="">— pick a person —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {personLabel(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Facts grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <Label>Project</Label>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.project_id ?? ""}
            onChange={(e) => void patch({ project_id: e.target.value || null })}
          >
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Label>Scheduled</Label>
          <input
            type="date"
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.scheduled_on ?? ""}
            onChange={(e) => void patch({ scheduled_on: e.target.value || null })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Deadline</Label>
          <input
            type="date"
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.deadline_on ?? ""}
            onChange={(e) => void patch({ deadline_on: e.target.value || null })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Kind</Label>
          <select
            className="rounded-sm bg-ink-2 px-2 py-1 text-text-0 outline-none"
            value={t.kind ?? "task"}
            onChange={(e) => void patch({ kind: e.target.value })}
          >
            {TICKET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Label>Flags</Label>
        <Pill active={!!t.urgent} onClick={() => void patch({ urgent: !t.urgent })} title="Shown as one glyph; the score stays under the hood">
          ! urgent
        </Pill>
        <Pill active={!!t.someday} onClick={() => void patch({ someday: !t.someday })}>
          someday
        </Pill>
        <span className="ml-3 text-[11px] text-ink-3">classic urgency</span>
        <select
          className="rounded-sm bg-ink-2 px-2 py-0.5 text-[11px] text-text-0"
          value={t.urgency ?? "someday"}
          onChange={(e) => void patch({ urgency: e.target.value as TaskUrgency })}
        >
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABEL[u]}
            </option>
          ))}
        </select>
      </div>

      {/* Contexts */}
      <div className="mt-5 rounded-v2-md border border-hairline p-3">
        <ContextEditor value={ctx} onChange={(next) => void saveCtx(next)} compact />
      </div>

      {/* Description */}
      <div className="mt-6">
        <Label>Description</Label>
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

      {/* Rundown (spec §9.1): Sonnet + web search for life tickets; code plans come from the skill */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <Label>Rundown</Label>
          {!closed && (
            <button
              type="button"
              disabled={saving}
              onClick={() => run(() => ticketFetch(`${apiKey}/plan`, { method: "POST", body: {} }), { lists: false })}
              className="text-[11px] text-glow-2 hover:underline disabled:opacity-40"
              title="Plan this: a short rundown with opening hours, where to book, what to bring and sub-task ideas"
            >
              {t.rundown_md ? "Regenerate" : "Plan this"}
            </button>
          )}
        </div>
        {t.rundown_md ? (
          <pre className="mt-1 whitespace-pre-wrap rounded-sm bg-ink-2 px-3 py-2 font-[family-name:var(--font-sans)] text-sm text-ink-4">{t.rundown_md}</pre>
        ) : (
          <p className="mt-1 text-[11px] text-ink-3">No rundown yet.</p>
        )}
      </div>

      {/* Steps: run-book page or plain checklist (spec §9.2) */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <Label>Steps</Label>
          <button
            type="button"
            onClick={() => {
              const name = prompt("Template name", t.title);
              if (!name) return;
              void run(
                () =>
                  ticketFetch("/api/tickets/templates", {
                    method: "POST",
                    body: { from_ticket: t.ticket_key ?? t.id, name },
                  }),
                { lists: false },
              );
            }}
            className="text-[11px] text-ink-3 hover:text-ink-4"
            title="Copy title, body, steps, contexts and sub-tasks into a reusable template"
          >
            Save as template
          </button>
        </div>
        <div className="mt-2">
          <StepsSection apiKey={apiKey} kind={t.kind ?? "task"} title={t.title} />
        </div>
      </div>

      {/* Sub-tasks */}
      {!t.parent_task_id && (
        <div className="mt-8">
          <Label>Sub-tasks</Label>
          <ul className="mt-2 flex flex-col gap-1.5">
            {data.sub_tasks.map((s) => (
              <TicketListRow
                key={s.id}
                t={s}
                simple={simple}
                action={
                  s.category !== "done" && s.category !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() =>
                        run(() =>
                          ticketFetch(`/api/tickets/${encodeURIComponent(s.ticket_key ?? s.id)}/complete`, {
                            method: "POST",
                            body: {},
                          }),
                        )
                      }
                      className="shrink-0 rounded-v2-md border border-hairline bg-surface-1 px-2.5 py-2 text-sm text-ok hover:bg-ok/15"
                      title="Done"
                    >
                      ✓
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none focus:ring-2 focus:ring-glow-2/60"
              value={subDraft}
              placeholder="Add a sub-task…"
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subDraft.trim()) {
                  const title = subDraft.trim();
                  setSubDraft("");
                  void run(() =>
                    ticketFetch("/api/tickets", {
                      method: "POST",
                      body: { title, parent_task_id: t.id, project_id: t.project_id ?? null, category: "next" },
                    }),
                  );
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Links / evidence */}
      <div className="mt-8">
        <Label>Links &amp; evidence</Label>
        <ul className="mt-2 space-y-1 text-sm">
          {data.links.length === 0 && <li className="text-ink-3">None yet.</li>}
          {data.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className="w-[72px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-ink-3">{l.kind}</span>
              {l.url ? (
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-glow-2 hover:underline">
                  {l.label ?? l.url}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ink-4">{l.label ?? l.ref}</span>
              )}
              <span className="shrink-0 text-[11px] text-ink-3">{fmtDay(l.at)}</span>
              <button
                type="button"
                onClick={() => run(() => ticketFetch(`${apiKey}/links?id=${l.id}`, { method: "DELETE" }), { lists: false })}
                className="text-[11px] text-ink-3 hover:text-danger"
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none"
            value={linkUrl}
            placeholder="https://…"
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <input
            className="w-40 rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none"
            value={linkLabel}
            placeholder="label"
            onChange={(e) => setLinkLabel(e.target.value)}
          />
          <button
            type="button"
            disabled={!/^https?:\/\//i.test(linkUrl) || saving}
            onClick={() => {
              const url = linkUrl.trim();
              const label = linkLabel.trim() || undefined;
              setLinkUrl("");
              setLinkLabel("");
              void run(() => ticketFetch(`${apiKey}/links`, { method: "POST", body: { url, label } }), { lists: false });
            }}
            className="rounded-sm bg-glow-2/20 px-3 py-2 text-sm text-glow-2 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {data.completions.length > 0 && (
        <div className="mt-6">
          <Label>Completions</Label>
          <p className="mt-1 text-[11px] text-ink-3">
            {data.completions.length} logged · last {fmtDay(data.completions[0])}
          </p>
        </div>
      )}

      {/* Comments */}
      <div className="mt-8">
        <Label>Comments</Label>
        <ul className="mt-2 space-y-2">
          {data.comments.length === 0 && <li className="text-sm text-ink-3">No comments yet.</li>}
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
              if (e.key === "Enter" && comment.trim()) {
                const body = comment.trim();
                setComment("");
                void run(() => ticketFetch(`${apiKey}/comments`, { method: "POST", body: { body } }), { lists: false });
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const body = comment.trim();
              if (!body) return;
              setComment("");
              void run(() => ticketFetch(`${apiKey}/comments`, { method: "POST", body: { body } }), { lists: false });
            }}
            disabled={!comment.trim() || saving}
            className="rounded-sm bg-glow-2/20 px-3 py-2 text-sm text-glow-2 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {data.activity.length > 0 && (
        <div className="mt-8">
          <Label>Activity</Label>
          <ul className="mt-2 space-y-1 text-xs text-ink-3">
            {data.activity.map((a) => (
              <li key={a.id}>
                {a.action}
                {a.field ? ` · ${a.field}` : ""}
                {a.from_value || a.to_value ? ` · ${a.from_value ?? "—"} → ${a.to_value ?? "—"}` : ""} ·{" "}
                {fmtDate(a.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between text-[11px] text-ink-3">
        <span>
          Created {fmtDate(t.created_at)}
          {t.completed_at ? ` · completed ${fmtDate(t.completed_at)}` : ""}
          {t.source && t.source !== "ui" ? ` · via ${t.source}` : ""}
        </span>
        {!closed ? (
          <button type="button" onClick={() => void move("cancelled")} className="hover:text-danger">
            Cancel ticket
          </button>
        ) : (
          <button type="button" onClick={() => void move("next")} className="hover:text-ink-4">
            Reopen → Next
          </button>
        )}
      </div>

      {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
    </div>
  );
}
