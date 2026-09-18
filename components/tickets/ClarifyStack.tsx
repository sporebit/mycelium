"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import type { Task } from "@/lib/types/task";
import type { Suggestion } from "@/lib/tickets/suggest";
import type { TicketCategory } from "@/lib/tickets/categories";
import { ContextEditor, Pill, contextOf, type ContextValue } from "./ContextEditor";
import { personLabel, ticketFetch, usePeople, useProjects } from "./pickers";

type Item = { ticket: Task; suggestion: Suggestion };
type Payload = { items: Item[]; total: number };

const CLARIFY_KEY = "/api/tickets/clarify";
export type ClarifySource = "inbox" | "backlog";
const KEY_FOR: Record<ClarifySource, string> = {
  inbox: CLARIFY_KEY,
  backlog: `${CLARIFY_KEY}?category=backlog`,
};

/** Only the stack's own keys and the badges — not every ticket list on the site. */
function revalidateClarify() {
  void globalMutate("/api/tickets/counts");
  void globalMutate((k) => typeof k === "string" && k.startsWith(CLARIFY_KEY), undefined, { revalidate: true });
}

/**
 * The Clarify stack (spec §8.4): one Inbox card at a time. Actionable? No →
 * Someday · Bin. Yes → Do it now (2-minute rule) · Delegate (waiting-on a
 * Person) · Defer (accept or adjust the suggested project, contexts, points
 * and dates, then Next or Backlog). Multi-step → add sub-tasks first.
 *
 * Every action advances the stack immediately and rolls back with a toast
 * if the request fails, so a card never blocks on a round trip.
 * Ctrl/Cmd+Enter fires the current mode's primary action.
 */
export function ClarifyStack({
  simple,
  source = "inbox",
  surface = null,
}: {
  simple: boolean;
  /** "backlog" = triage mode: the same stack over un-parked Backlog tickets, contexts first. */
  source?: ClarifySource;
  /** Tickets / Tasks partition: limit the stack to one surface (0121). */
  surface?: "tickets" | "tasks" | null;
}) {
  const key = surface ? `${KEY_FOR[source]}${source === "inbox" ? "?" : "&"}surface=${surface}` : KEY_FOR[source];
  const { data, error, isLoading } = useApi<Payload>(key);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [doneCount, setDoneCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const items = (data?.items ?? []).filter((i) => !skipped.has(i.ticket.id) && !handled.has(i.ticket.id));
  const current = items[0] ?? null;

  /** Advance first; on failure put the card back and say why. */
  const act = (id: string, work: () => Promise<unknown>) => {
    setHandled((s) => new Set(s).add(id));
    setDoneCount((n) => n + 1);
    work()
      .then(() => revalidateClarify())
      .catch((e: unknown) => {
        setHandled((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        setDoneCount((n) => Math.max(0, n - 1));
        const msg = e instanceof Error ? e.message : "That didn't save — the card is back.";
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
        // the app-wide toast (<ApiErrorToast/> in Shell listens for this)
        window.dispatchEvent(new CustomEvent("api-error", { detail: `Clarify: ${msg}` }));
      });
  };

  if (error) return <p className="text-sm text-ink-3">Could not load the Inbox.</p>;
  if (isLoading || !data) return <p className="text-sm text-ink-3">Loading…</p>;

  if (!current) {
    return (
      <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
        <p className="text-sm text-ink-4">{source === "backlog" ? "Backlog triaged." : "Inbox zero."}</p>
        {doneCount > 0 && <p className="mt-1 text-[11px] text-ink-3">{doneCount} clarified this sitting.</p>}
        {skipped.size > 0 && (
          <button type="button" onClick={() => setSkipped(new Set())} className="mt-3 text-xs text-glow-2 hover:underline">
            Show the {skipped.size} you skipped
          </button>
        )}
        {toast && <p className="mt-2 text-[11px] text-danger">{toast}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
        <span>
          {items.length} to clarify{skipped.size > 0 ? ` · ${skipped.size} skipped` : ""}
        </span>
        <span className="hidden sm:inline">Ctrl+Enter = primary action</span>
      </p>
      {toast && <p className="mb-2 rounded-sm border border-danger/40 bg-danger/5 px-2 py-1 text-[11px] text-danger">{toast}</p>}
      <ClarifyCard
        key={current.ticket.id}
        item={current}
        simple={simple}
        source={source}
        onSkip={() => setSkipped((s) => new Set(s).add(current.ticket.id))}
        onAct={(work) => act(current.ticket.id, work)}
      />
    </div>
  );
}

type Mode = "ask" | "defer" | "delegate" | "subtasks";

function ClarifyCard({
  item,
  simple,
  source,
  onSkip,
  onAct,
}: {
  item: Item;
  simple: boolean;
  source: ClarifySource;
  onSkip: () => void;
  onAct: (work: () => Promise<unknown>) => void;
}) {
  const { ticket: t, suggestion: s } = item;
  const projects = useProjects();
  const people = usePeople();
  // Backlog triage opens on the contexts (Phil: contexts first); Inbox asks first.
  const [mode, setMode] = useState<Mode>(source === "backlog" ? "defer" : "ask");
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(t.title);
  const [projectId, setProjectId] = useState<string>(t.project_id ?? s.project_id ?? "");
  const [ctx, setCtx] = useState<ContextValue>(() =>
    contextOf({
      where_ctx: s.where_ctx ?? t.where_ctx,
      tools: s.tools ?? t.tools,
      time_window: s.time_window ?? t.time_window,
      time_from: t.time_from,
      time_to: t.time_to,
      days: t.days,
      points: s.points ?? t.points ?? null,
    }),
  );
  const [scheduledOn, setScheduledOn] = useState(t.scheduled_on ?? s.scheduled_on ?? "");
  const [deadlineOn, setDeadlineOn] = useState(t.deadline_on ?? s.deadline_on ?? "");
  const [personId, setPersonId] = useState<string>(t.waiting_on_person_id ?? "");
  const [subtasks, setSubtasks] = useState("");

  const key = t.ticket_key ?? t.id;
  const base = `/api/tickets/${encodeURIComponent(key)}`;

  const savedTitle = async () => {
    const v = title.trim();
    if (v && v !== t.title) await ticketFetch(base, { method: "PATCH", body: { title: v } });
  };

  const move = (category: TicketCategory, extra: Record<string, unknown> = {}) =>
    onAct(async () => {
      await savedTitle();
      await ticketFetch(`${base}/move`, { method: "POST", body: { category, ...extra } });
    });

  const didIt = () =>
    onAct(async () => {
      await savedTitle();
      await ticketFetch(`${base}/complete`, { method: "POST", body: {} });
    });

  const defer = (category: "next" | "backlog") =>
    onAct(() =>
      ticketFetch(base, {
        method: "PATCH",
        body: {
          title: title.trim() || t.title,
          project_id: projectId || null,
          where_ctx: ctx.where_ctx,
          tools: ctx.tools,
          time_window: ctx.time_window,
          time_from: ctx.time_window === "custom" ? (ctx.time_from ?? null) : null,
          time_to: ctx.time_window === "custom" ? (ctx.time_to ?? null) : null,
          days: ctx.time_window === "custom" ? (ctx.days ?? null) : null,
          points: ctx.points,
          scheduled_on: scheduledOn || null,
          deadline_on: deadlineOn || null,
          someday: false,
          category,
        },
      }),
    );

  const addSubtasks = async () => {
    const lines = subtasks
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setErr(null);
    try {
      await Promise.all(
        lines.map((line) =>
          ticketFetch("/api/tickets", {
            method: "POST",
            body: { title: line, parent_task_id: t.id, project_id: t.project_id ?? null, category: "next" },
          }),
        ),
      );
      setSubtasks("");
      setMode("defer"); // the parent stays until it is itself deferred
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not add sub-tasks");
    }
  };

  // Ctrl/Cmd+Enter → the mode's primary action (Phil's ask).
  const primaryRef = useRef<() => void>(() => {});
  useEffect(() => {
    primaryRef.current = () => {
      if (mode === "ask") setMode("defer");
      else if (mode === "defer") defer("next");
      else if (mode === "subtasks") void addSubtasks();
      else if (mode === "delegate" && personId) move("waiting", { waiting_on_person_id: personId });
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        primaryRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const askRow = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill active={false} onClick={() => move("backlog", { someday: true })} title="Keep for a rainy day">
        Someday
      </Pill>
      <Pill active={false} onClick={() => move("cancelled")} title="Cancel">
        Bin
      </Pill>
      <span className="mx-1 text-ink-2">|</span>
      <Pill active={false} tone="accent" onClick={didIt} title="Under two minutes — do it and mark done">
        ✓ Did it
      </Pill>
      <Pill active={false} onClick={() => setMode("delegate")} title="Waiting on someone">
        Delegate
      </Pill>
      <Pill active={mode === "defer"} tone="accent" onClick={() => setMode("defer")} title="Set contexts and dates, then Next or Backlog">
        Defer →
      </Pill>
      <Pill active={mode === "subtasks"} onClick={() => setMode("subtasks")} title="More than one step">
        Multi-step
      </Pill>
    </div>
  );

  return (
    <div className="rounded-v2-lg border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/organisation/tickets/${encodeURIComponent(key)}`} className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-glow-2 hover:underline">
          {t.ticket_key ?? "—"}
        </Link>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          {t.project_name && <span>{t.project_name}</span>}
          {t.source && t.source !== "ui" && <span>via {t.source}</span>}
          <button type="button" onClick={onSkip} className="hover:text-ink-4">
            skip →
          </button>
        </div>
      </div>

      <input
        className="mt-2 w-full bg-transparent text-lg font-semibold text-text-0 outline-none focus:border-b focus:border-glow-2/60"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {t.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-3">{t.description}</p>}
      {s.reasons.length > 0 && <p className="mt-2 text-[11px] text-ink-3">Suggested: {s.reasons.join(" · ")}</p>}

      {mode === "ask" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-v2-md border border-hairline p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Not actionable</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill active={false} onClick={() => move("backlog", { someday: true })} title="Keep for a rainy day">
                Someday
              </Pill>
              <Pill active={false} onClick={() => move("cancelled")} title="Cancel">
                Bin
              </Pill>
            </div>
          </div>
          <div className="rounded-v2-md border border-hairline p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Actionable</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill active={false} tone="accent" onClick={didIt} title="Under two minutes — do it and mark done">
                ✓ Did it
              </Pill>
              <Pill active={false} onClick={() => setMode("delegate")} title="Waiting on someone">
                Delegate
              </Pill>
              <Pill active={false} tone="accent" onClick={() => setMode("defer")} title="Set contexts and dates, then Next or Backlog">
                Defer →
              </Pill>
              <Pill active={false} onClick={() => setMode("subtasks")} title="More than one step">
                Multi-step
              </Pill>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3">{askRow}</div>
      )}

      {mode === "delegate" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Waiting on</span>
          <select className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">— pick a person —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {personLabel(p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!personId}
            onClick={() => move("waiting", { waiting_on_person_id: personId })}
            className="rounded-sm bg-glow-2/20 px-3 py-1 text-sm text-glow-2 disabled:opacity-40"
          >
            Move to Waiting
          </button>
          <button type="button" onClick={() => setMode("ask")} className="text-[11px] text-ink-3">
            back
          </button>
        </div>
      )}

      {mode === "subtasks" && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Sub-tasks, one per line</p>
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-sm bg-ink-2 px-3 py-2 text-sm text-text-0 outline-none"
            value={subtasks}
            onChange={(e) => setSubtasks(e.target.value)}
            placeholder={"Find the receipt\nPrint the return label\nDrop at the post office"}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" disabled={!subtasks.trim()} onClick={() => void addSubtasks()} className="rounded-sm bg-glow-2/20 px-3 py-1 text-sm text-glow-2 disabled:opacity-40">
              Add and continue
            </button>
            <button type="button" onClick={() => setMode("ask")} className="text-[11px] text-ink-3">
              back
            </button>
          </div>
        </div>
      )}

      {mode === "defer" && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">Project</span>
            <select className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— none (Inbox prefix) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <ContextEditor value={ctx} onChange={setCtx} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">Dates</span>
            <label className="flex items-center gap-1 text-[11px] text-ink-3">
              ▸ scheduled
              <input type="date" className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0" value={scheduledOn} onChange={(e) => setScheduledOn(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-ink-3">
              ⚑ deadline
              <input type="date" className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0" value={deadlineOn} onChange={(e) => setDeadlineOn(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => defer("next")} className="rounded-sm bg-accent/20 px-3 py-1.5 text-sm text-accent" title="Ctrl+Enter">
              {simple ? "→ Todo" : "→ Next"}
            </button>
            <button type="button" onClick={() => defer("backlog")} className="rounded-sm bg-ink-2 px-3 py-1.5 text-sm text-ink-4">
              {source === "backlog" ? "Save, keep in Backlog" : "→ Backlog"}
            </button>
            {source !== "backlog" && (
              <button type="button" onClick={() => setMode("ask")} className="text-[11px] text-ink-3">
                back
              </button>
            )}
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
    </div>
  );
}
