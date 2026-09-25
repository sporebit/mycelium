"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import { withArea } from "@/lib/tickets/areaChip";
import { DATE_RANGE_KEYS, type DateRangeKey, type SortColumn, type SortDir } from "@/lib/tickets/dateFilters";
import { CATEGORY_LABEL, TICKET_CATEGORIES, type TicketCategory } from "@/lib/tickets/categories";
import type { Task } from "@/lib/types/task";
import { TaskTableView, type TableColumnId } from "@/components/compost/TaskTableView";
import { useProjects } from "@/components/tickets/pickers";
import { ticketFetch } from "@/components/tickets/pickers";
import { mutate as globalMutate } from "swr";

/**
 * The dates list (tasks-merge M4): every ticket, done and cancelled included,
 * in the classic table view extended with Raised · Started · Finished ·
 * Closed. Sort and every filter go to /api/tickets so the server does the
 * work; the Area chip above narrows it like every other tab.
 */

const RANGE_LABEL: Record<DateRangeKey, string> = { created: "Raised", started: "Started", completed: "Finished", closed: "Closed" };
const COLUMNS: TableColumnId[] = ["select", "key", "title", "project", "status", "created", "started", "finished", "closed"];

type Ranges = Record<DateRangeKey, { from: string; to: string }>;
const EMPTY_RANGES: Ranges = { created: { from: "", to: "" }, started: { from: "", to: "" }, completed: { from: "", to: "" }, closed: { from: "", to: "" } };

const input = "bg-ink-2 rounded-sm text-xs text-text-0 px-2 py-1 outline outline-1 outline-transparent focus:outline-glow-2";

export function TicketsTable() {
  const router = useRouter();
  const { prefs } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const projects = useProjects();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [ranges, setRanges] = useState<Ranges>(EMPTY_RANGES);
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir } | null>({ column: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const url = useMemo(() => {
    const sp = new URLSearchParams({ list: "all", limit: "1000" });
    if (q.trim()) sp.set("q", q.trim());
    if (category) sp.set("category", category);
    for (const k of DATE_RANGE_KEYS) {
      if (ranges[k].from) sp.set(`${k}_from`, ranges[k].from);
      if (ranges[k].to) sp.set(`${k}_to`, ranges[k].to);
    }
    if (sort) {
      sp.set("sort", sort.column);
      sp.set("dir", sort.dir);
    }
    return withArea(`/api/tickets?${sp.toString()}`, tp.area);
  }, [q, category, ranges, sort, tp.area]);

  const { data, error, isLoading } = useApi<{ tickets: Task[] }>(url);
  const tickets = data?.tickets ?? [];

  const setRange = (k: DateRangeKey, edge: "from" | "to", v: string) => setRanges((cur) => ({ ...cur, [k]: { ...cur[k], [edge]: v } }));
  const anyFilter = q.trim() || category || DATE_RANGE_KEYS.some((k) => ranges[k].from || ranges[k].to);

  const patch = async (id: string, p: Partial<Task>) => {
    try {
      await ticketFetch(`/api/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: p });
      await globalMutate(url);
      void globalMutate("/api/tickets/counts");
    } catch {
      /* the row keeps its server value on the next revalidate */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-v2-lg border border-hairline bg-surface-1 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="key or title" className={`${input} w-44`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Status</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory | "")} className={input}>
            <option value="">Any</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {DATE_RANGE_KEYS.map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{RANGE_LABEL[k]}</span>
            <div className="flex items-center gap-1">
              <input type="date" value={ranges[k].from} onChange={(e) => setRange(k, "from", e.target.value)} className={input} aria-label={`${RANGE_LABEL[k]} from`} />
              <span className="text-ink-3 text-xs">–</span>
              <input type="date" value={ranges[k].to} onChange={(e) => setRange(k, "to", e.target.value)} className={input} aria-label={`${RANGE_LABEL[k]} to`} />
            </div>
          </div>
        ))}
        {anyFilter && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setCategory("");
              setRanges(EMPTY_RANGES);
            }}
            className="text-[11px] text-ink-3 hover:text-ink-4 pb-1.5"
          >
            clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-3 pb-1.5">
          {isLoading && !data ? "Loading…" : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
          {tickets.length >= 1000 && " (first 1000)"}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-ink-3">Could not load the table.</p>
      ) : (
        <TaskTableView
          tasks={tickets}
          selected={selected}
          projects={projects.map((p) => ({ id: p.id, name: p.name })) as never}
          columns={COLUMNS}
          includeSubtasks
          storageKey="mycelium:dates-table-v1"
          sort={sort ? { column: sort.column, dir: sort.dir } : null}
          onSortChange={setSort}
          onOpen={(t) => router.push(t.ticket_key ? `/organisation/tickets/${encodeURIComponent(t.ticket_key)}` : `/organisation/tasks?task=${t.id}`)}
          onToggleSelect={(id) =>
            setSelected((cur) => {
              const next = new Set(cur);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onPatch={(id, p) => void patch(id, p)}
        />
      )}
    </div>
  );
}
