"use client";

import { DUE_WINDOW_LABEL } from "@/lib/tickets/when";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import { areaParams, withArea } from "@/lib/tickets/areaChip";
import {
  CATEGORY_LABEL,
  GTD_LISTS,
  GTD_LIST_LABEL,
  SIMPLE_BUCKETS,
  SIMPLE_BUCKET_LABEL,
  SIMPLE_BUCKET_TARGET,
  TICKET_CATEGORIES,
  type GtdList,
  type TicketCategory,
} from "@/lib/tickets/categories";
import type { TicketCounts } from "@/lib/tickets/query";
import { AreaChip } from "@/components/tickets/AreaChip";
import { ClarifyStack } from "@/components/tickets/ClarifyStack";
import { Pill } from "@/components/tickets/ContextEditor";
import { NowView } from "@/components/tickets/NowView";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { ticketFetch, useProjects } from "@/components/tickets/pickers";
import { TicketListRow, type TicketRowData } from "@/components/tickets/TicketListRow";
import { TasksClient } from "@/components/compost/TasksClient";

/**
 * The Tasks home at /organisation/tasks (tasks-merge M1): one surface over
 * the one `tickets` table. Now is the home tab, then the GTD tabs, then the
 * classic Board (kanban / calendar, the old /organisation/tasks client) and
 * the dates Table (M4). The Area chip (M2) narrows every tab the same way.
 * The old /organisation/tickets URL redirects here; ticket pages, sprints,
 * review and templates keep their /organisation/tickets/... URLs.
 */

type Tab = GtdList | "board" | "table";
const TABS: Tab[] = [...GTD_LISTS, "board", "table"];
const TAB_LABEL: Record<Tab, string> = { ...GTD_LIST_LABEL, board: "Board", table: "Table" };

const HINT: Record<Tab, string> = {
  now: "What you can do right now, here, with what you have",
  inbox: "Captured, not yet clarified",
  today: "Scheduled or due today, including overdue",
  upcoming: "Scheduled or due later",
  next: "Next actions — ready to start, not blocked",
  waiting: "Waiting on someone else",
  someday: "Someday / maybe",
  logbook: "Done and cancelled",
  board: "The classic board and calendar — drag to move, swipe on a phone",
  table: "Every ticket with its dates — Raised, Started, Finished, Closed. Sort and filter.",
};

function ListTab({ list, simple, areaQuery }: { list: Exclude<GtdList, "now">; simple: boolean; areaQuery: string }) {
  const key = `/api/tickets?list=${list}${areaQuery}`;
  const { data, error, isLoading } = useApi<{ tickets: TicketRowData[] }>(key);
  const tickets = data?.tickets ?? [];
  const projects = useProjects();

  // Bulk mode (spec §12: long-press = bulk). Selection is by key so the
  // bulk route resolves it; the bar applies one whitelisted change to all.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keyOf = (t: TicketRowData) => t.ticket_key ?? t.id;
  const toggle = (t: TicketRowData) =>
    setSelected((s) => {
      const next = new Set(s);
      const k = keyOf(t);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const exit = () => {
    setSelecting(false);
    setSelected(new Set());
    setErr(null);
  };
  const apply = async (set: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await ticketFetch("/api/tickets/bulk", { method: "POST", body: { keys: [...selected], set } });
      await globalMutate(key);
      void globalMutate((k) => typeof k === "string" && k.startsWith("/api/tickets/counts"));
      exit();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "bulk update failed");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-ink-3">Could not load tasks.</p>;
  if (isLoading || !data) return <p className="text-sm text-ink-3">Loading…</p>;
  if (tickets.length === 0) {
    return (
      <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
        <p className="text-sm italic text-ink-3">Nothing in {GTD_LIST_LABEL[list]}.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
        <span>{tickets.length} tasks</span>
        <button
          type="button"
          onClick={() => (selecting ? exit() : setSelecting(true))}
          className="hover:text-ink-4"
        >
          {selecting ? "Done selecting" : "Select"}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {tickets.map((t) => (
          <TicketListRow
            key={t.id}
            t={t}
            simple={simple}
            showCategory={list !== "inbox"}
            selectable={selecting}
            selected={selected.has(keyOf(t))}
            onToggleSelect={() => toggle(t)}
            onLongPress={() => {
              setSelecting(true);
              setSelected((s) => new Set(s).add(keyOf(t)));
            }}
          />
        ))}
      </ul>
      {selecting && (
        <div className="sticky bottom-3 mt-3 rounded-v2-lg border border-glow-2/40 bg-surface-1/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[11px] text-ink-3">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Set(tickets.map(keyOf)))}
              className="text-[11px] text-ink-3 hover:text-ink-4"
            >
              all
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Move</span>
              {(simple ? SIMPLE_BUCKETS : TICKET_CATEGORIES).map((c) => {
                const target = simple
                  ? SIMPLE_BUCKET_TARGET[c as (typeof SIMPLE_BUCKETS)[number]]
                  : (c as TicketCategory);
                const label = simple
                  ? SIMPLE_BUCKET_LABEL[c as (typeof SIMPLE_BUCKETS)[number]]
                  : CATEGORY_LABEL[c as TicketCategory];
                return (
                  <Pill key={c} active={false} onClick={() => void apply({ category: target })}>
                    {label}
                  </Pill>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">When</span>
              {(["week", "month", "month_end", "someday"] as const).map((w) => (
                <Pill key={w} active={false} onClick={() => void apply({ due_window: w })}>
                  {DUE_WINDOW_LABEL[w]}
                </Pill>
              ))}
              <Pill active={false} onClick={() => void apply({ due_window: null })} title="No deadline">
                clear
              </Pill>
            </div>
            <select
              className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) void apply({ project_id: e.target.value });
              }}
            >
              <option value="">Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply({ category: "cancelled" })}
              className="text-[11px] text-ink-3 hover:text-danger"
            >
              Cancel tasks
            </button>
            {busy && <span className="text-[11px] text-ink-3">saving…</span>}
            {err && <span className="text-[11px] text-danger">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function TasksHome() {
  const searchParams = useSearchParams();
  // A link into the classic client (?task= ?focus= ?view= ?filter=) opens the Board tab.
  const classicLink = ["task", "focus", "view", "filter"].some((k) => searchParams.has(k));
  const [tab, setTab] = useState<Tab>(classicLink ? "board" : "now");
  const [triage, setTriage] = useState(false);
  const { prefs, setPrefs } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const simple = tp.simple_statuses;
  const ap = areaParams(tp.area);
  const areaQuery = Object.keys(ap).length ? `&${new URLSearchParams(ap).toString()}` : "";
  const { data: countsData } = useApi<{ counts: TicketCounts }>(withArea("/api/tickets/counts", tp.area));
  const counts = countsData?.counts;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">Tasks</h1>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => void setPrefs({ tickets: { ...tp, simple_statuses: !simple } })}
            className="text-ink-3 hover:text-ink-4"
            title="Collapse statuses to Todo / Doing / Waiting / Done"
          >
            {simple ? "Detailed statuses" : "Simple statuses"}
          </button>
          <Link href="/organisation/tickets/sprints" className="text-ink-3 hover:text-ink-4">
            Sprints
          </Link>
          <Link href="/organisation/tickets/review" className="text-ink-3 hover:text-ink-4">
            Review
          </Link>
          <Link href="/organisation/tickets/templates" className="text-ink-3 hover:text-ink-4">
            Templates
          </Link>
        </div>
      </div>

      <div className="mt-3">
        <AreaChip />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((l) => {
          const active = l === tab;
          const n = l === "now" || l === "board" || l === "table" ? null : (counts?.[l] ?? null);
          return (
            <button
              key={l}
              type="button"
              onClick={() => setTab(l)}
              aria-pressed={active}
              title={HINT[l]}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-[0.14em] transition-colors ${
                active
                  ? "border-glow-2/50 bg-glow-2/15 text-glow-2"
                  : "border-ink-2 bg-ink-0/40 text-ink-3 hover:border-ink-3 hover:text-ink-4"
              }`}
            >
              {TAB_LABEL[l]}
              {n != null && n > 0 && <span className="ml-1.5 text-ink-3">{n}</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-ink-3">{HINT[tab]}</p>

      <div className="mt-4">
        {tab === "now" ? (
          <NowView simple={simple} />
        ) : tab === "inbox" ? (
          <div>
            <div className="mb-3 flex items-center justify-between text-[11px] text-ink-3">
              <span>{triage ? "Triaging the Backlog — same cards, older tickets" : "Clarify what came in"}</span>
              <button
                type="button"
                onClick={() => setTriage((v) => !v)}
                className="text-glow-2 hover:underline"
              >
                {triage
                  ? "← Back to Inbox"
                  : `Triage backlog${counts?.backlog ? ` (${counts.backlog})` : ""} →`}
              </button>
            </div>
            <ClarifyStack simple={simple} source={triage ? "backlog" : "inbox"} areaQuery={areaQuery} />
          </div>
        ) : tab === "board" ? (
          <TasksClient />
        ) : tab === "table" ? (
          <TicketsTable />
        ) : (
          <ListTab list={tab} simple={simple} areaQuery={areaQuery} />
        )}
      </div>
    </div>
  );
}
