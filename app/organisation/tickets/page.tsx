"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import { GTD_LISTS, GTD_LIST_LABEL, type GtdList } from "@/lib/tickets/categories";
import type { TicketCounts } from "@/lib/tickets/query";
import { ClarifyStack } from "@/components/tickets/ClarifyStack";
import { NowView } from "@/components/tickets/NowView";
import { TicketListRow, type TicketRowData } from "@/components/tickets/TicketListRow";

// Part B: the Tickets home at /organisation/tickets (spec §12). Now is the
// home tab; the GTD tabs read the category-native lists from /api/tickets
// (0117 keeps status_id and the legacy status in step, so the lists and the
// classic Tasks view agree). Rows link to the key-addressed ticket page.

const HINT: Record<GtdList, string> = {
  now: "What you can do right now, here, with what you have",
  inbox: "Captured, not yet clarified",
  today: "Scheduled or due today, including overdue",
  upcoming: "Scheduled or due later",
  next: "Next actions — ready to start, not blocked",
  waiting: "Waiting on someone else",
  someday: "Someday / maybe",
  logbook: "Done and cancelled",
};

function ListTab({ list, simple }: { list: Exclude<GtdList, "now">; simple: boolean }) {
  const { data, error, isLoading } = useApi<{ tickets: TicketRowData[] }>(
    `/api/tickets?list=${list}`,
  );
  const tickets = data?.tickets ?? [];
  if (error) return <p className="text-sm text-ink-3">Could not load tickets.</p>;
  if (isLoading || !data) return <p className="text-sm text-ink-3">Loading…</p>;
  if (tickets.length === 0) {
    return (
      <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
        <p className="text-sm italic text-ink-3">Nothing in {GTD_LIST_LABEL[list]}.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {tickets.map((t) => (
        <TicketListRow key={t.id} t={t} simple={simple} showCategory={list !== "inbox"} />
      ))}
    </ul>
  );
}

export default function TicketsHomePage() {
  const [tab, setTab] = useState<GtdList>("now");
  const { prefs, setPrefs } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const simple = tp.simple_statuses;
  const { data: countsData } = useApi<{ counts: TicketCounts }>("/api/tickets/counts");
  const counts = countsData?.counts;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">Tickets</h1>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => void setPrefs({ tickets: { ...tp, simple_statuses: !simple } })}
            className="text-ink-3 hover:text-ink-4"
            title="Collapse statuses to Todo / Doing / Waiting / Done"
          >
            {simple ? "Detailed statuses" : "Simple statuses"}
          </button>
          <Link href="/organisation/tasks" className="text-glow-2 hover:underline">
            Classic view →
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {GTD_LISTS.map((l) => {
          const active = l === tab;
          const n = l === "now" ? null : (counts?.[l] ?? null);
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
              {GTD_LIST_LABEL[l]}
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
          <ClarifyStack simple={simple} />
        ) : (
          <ListTab list={tab} simple={simple} />
        )}
      </div>
    </div>
  );
}
