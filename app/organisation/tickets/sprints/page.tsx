"use client";

import { useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import type { SprintSummary } from "@/lib/tickets/sprints";
import type { TicketRow } from "@/lib/tickets/query";
import { Pill } from "@/components/tickets/ContextEditor";
import { TicketListRow } from "@/components/tickets/TicketListRow";
import { ticketFetch, useProjects } from "@/components/tickets/pickers";

type Burndown = Array<{ date: string; remaining: number; ideal: number }>;

function plus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Sprints (0123): a commitment layer over GTD for technical projects.
 * Pick a project → the active sprint (goal, days left, points done/total,
 * burndown), its tickets with quick Done / remove, an "add from Next /
 * Backlog" picker, planned sprints, and velocity from closed ones.
 */
export default function SprintsPage() {
  const projects = useProjects();
  const [projectId, setProjectId] = useState<string>("");
  const pid = projectId || projects[0]?.id || "";
  const key = pid ? `/api/sprints?project=${pid}` : null;
  const { data, mutate } = useApi<{ sprints: SprintSummary[]; velocity: Array<{ name: string; points_done: number; points_committed: number }>; today: string }>(key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", goal: "", starts_on: plus(0), ends_on: plus(13) });

  const active = data?.sprints.find((s) => s.status === "active") ?? null;
  const planned = data?.sprints.filter((s) => s.status === "planned") ?? [];
  const closed = data?.sprints.filter((s) => s.status === "closed") ?? [];

  const sprintKey = active ? `/api/tickets?sprint=${active.id}&subtasks=1` : null;
  const { data: inSprint } = useApi<{ tickets: TicketRow[] }>(sprintKey);
  const { data: detail } = useApi<{ burndown: Burndown }>(active ? `/api/sprints/${active.id}` : null);
  const candidatesKey = pid ? `/api/tickets?category=next,backlog,doing&project=${pid}&limit=200` : null;
  const { data: candidates } = useApi<{ tickets: TicketRow[] }>(candidatesKey);
  const pool = (candidates?.tickets ?? []).filter((t) => !t.sprint_id);

  const refresh = async () => {
    await mutate();
    void globalMutate((k) => typeof k === "string" && (k.startsWith("/api/tickets?") || k.startsWith("/api/sprints")), undefined, { revalidate: true });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const setSprint = (t: TicketRow, sprintId: string | null) =>
    run(() => ticketFetch(`/api/tickets/${encodeURIComponent(t.ticket_key ?? t.id)}`, { method: "PATCH", body: { sprint_id: sprintId } }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">Sprints</h1>
        <div className="flex items-center gap-3 text-xs">
          <select className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" value={pid} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prefix ? `${p.prefix} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
          <Link href="/organisation/tickets" className="text-glow-2 hover:underline">
            ← Tickets
          </Link>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">A sprint is what you committed to this iteration; tickets keep their Next / Doing state inside it. The Sprint chip on the Now view limits Now to the active sprint.</p>
      {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}

      {!data ? (
        <p className="mt-4 text-sm text-ink-3">Loading…</p>
      ) : active ? (
        <section className="mt-4 rounded-v2-lg border border-glow-2/40 bg-surface-1 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-glow-2">Active sprint</span>
              <h2 className="text-base font-semibold text-text-0">{active.name}</h2>
              {active.goal && <p className="text-sm text-ink-3">{active.goal}</p>}
            </div>
            <div className="text-right text-[11px] text-ink-3">
              <div>
                {active.starts_on} → {active.ends_on} · {active.days_left} of {active.days_total} days left
              </div>
              <div className="font-[family-name:var(--font-mono)] text-text-0">
                {active.points_finished}/{active.points_total} pts · {active.tickets_done}/{active.tickets_total} tickets
              </div>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-ink-2">
            <div className="h-full bg-accent" style={{ width: `${active.points_total ? Math.round((active.points_finished / active.points_total) * 100) : 0}%` }} />
          </div>
          {detail?.burndown && detail.burndown.length > 1 && <BurndownChart data={detail.burndown} />}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const carry = planned[0]?.id ?? null;
                if (!confirm(`Close "${active.name}"? Unfinished tickets ${carry ? `move to "${planned[0].name}"` : "leave the sprint"}.`)) return;
                void run(() => ticketFetch(`/api/sprints/${active.id}`, { method: "PATCH", body: { status: "closed", carry_to: carry } }));
              }}
              className="rounded-sm bg-ink-2 px-3 py-1 text-sm text-ink-4 disabled:opacity-40"
            >
              Close sprint
            </button>
          </div>

          <div className="mt-4">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Committed</span>
            {!inSprint ? (
              <p className="text-sm text-ink-3">Loading…</p>
            ) : inSprint.tickets.length === 0 ? (
              <p className="text-sm italic text-ink-3">Nothing committed yet — add from the pool below.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {inSprint.tickets.map((t) => (
                  <TicketListRow
                    key={t.id}
                    t={t}
                    action={
                      <span className="flex shrink-0 items-center gap-1.5">
                        {t.category !== "done" && (
                          <Pill active={false} tone="accent" onClick={() => void run(() => ticketFetch(`/api/tickets/${encodeURIComponent(t.ticket_key ?? t.id)}/complete`, { method: "POST", body: {} }))}>
                            ✓
                          </Pill>
                        )}
                        <Pill active={false} onClick={() => void setSprint(t, null)} title="Remove from the sprint">
                          −
                        </Pill>
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Add from Next / Backlog / Doing</span>
            {pool.length === 0 ? (
              <p className="text-sm italic text-ink-3">Nothing left to commit in this project.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {pool.slice(0, 40).map((t) => (
                  <TicketListRow
                    key={t.id}
                    t={t}
                    action={
                      <Pill active={false} tone="accent" onClick={() => void setSprint(t, active.id)} title="Commit to this sprint">
                        +
                      </Pill>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section className="mt-4 rounded-v2-lg border border-hairline bg-surface-1 p-4">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">No active sprint</span>
          <p className="text-sm text-ink-3">Start one below, or activate a planned sprint.</p>
        </section>
      )}

      {/* new sprint */}
      <section className="mt-4 rounded-v2-lg border border-hairline bg-surface-1 p-4">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">New sprint</span>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input className="min-w-[160px] flex-1 rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" placeholder="Sprint 1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="min-w-[200px] flex-[2] rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" placeholder="goal (one line)" value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} />
          <input type="date" className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} />
          <input type="date" className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0" value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} />
          <button
            type="button"
            disabled={busy || !pid || !draft.name.trim()}
            onClick={() =>
              void run(async () => {
                await ticketFetch("/api/sprints", { method: "POST", body: { project_id: pid, ...draft, activate: !active } });
                setDraft({ name: "", goal: "", starts_on: plus(0), ends_on: plus(13) });
              })
            }
            className="rounded-sm bg-accent/20 px-3 py-1 text-sm text-accent disabled:opacity-40"
          >
            {active ? "Plan" : "Start"}
          </button>
        </div>
      </section>

      {planned.length > 0 && (
        <section className="mt-4">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Planned</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {planned.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-v2-md border border-hairline bg-surface-1 px-3 py-2 text-sm">
                <span className="flex-1 text-text-0">{s.name}</span>
                <span className="text-[11px] text-ink-3">
                  {s.starts_on} → {s.ends_on} · {s.tickets_total} tickets · {s.points_total} pts
                </span>
                {!active && (
                  <Pill active={false} tone="accent" onClick={() => void run(() => ticketFetch(`/api/sprints/${s.id}`, { method: "PATCH", body: { status: "active" } }))}>
                    activate
                  </Pill>
                )}
                <button type="button" onClick={() => void run(() => ticketFetch(`/api/sprints/${s.id}`, { method: "DELETE" }))} className="text-[11px] text-ink-3 hover:text-danger">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section className="mt-4">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Velocity (closed sprints)</span>
          <ul className="mt-2 flex flex-col gap-1 text-[12px]">
            {closed.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="w-40 truncate text-ink-4">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-ink-2">
                  <div className="h-full bg-ok" style={{ width: `${s.points_total ? Math.round((s.points_finished / s.points_total) * 100) : 0}%` }} />
                </div>
                <span className="w-24 text-right font-[family-name:var(--font-mono)] text-ink-3">
                  {s.points_finished}/{s.points_total} pts
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BurndownChart({ data }: { data: Burndown }) {
  const w = 320;
  const h = 80;
  const max = Math.max(1, ...data.map((p) => p.ideal), ...data.map((p) => (p.remaining >= 0 ? p.remaining : 0)));
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 4 - (v / max) * (h - 8);
  const ideal = data.map((p, i) => `${x(i)},${y(p.ideal)}`).join(" ");
  const actual = data.filter((p) => p.remaining >= 0).map((p, i) => `${x(i)},${y(p.remaining)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-20 w-full max-w-md" role="img" aria-label="Burndown">
      <polyline points={ideal} fill="none" stroke="currentColor" className="text-ink-2" strokeWidth="1" strokeDasharray="3 3" />
      {actual && <polyline points={actual} fill="none" stroke="currentColor" className="text-accent" strokeWidth="2" />}
    </svg>
  );
}
