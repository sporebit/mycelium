"use client";

import { OverduePill } from "@/components/tickets/OverduePill";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { useApi } from "@/lib/data/useApi";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import { applyNowContext, chipsFor, nowQueryUrl, orderForContext } from "@/components/tickets/nowQuery";
import { useDevice } from "@/components/tickets/useDevice";
import { ticketHref, type TicketRowData } from "@/components/tickets/TicketListRow";

/**
 * Dashboard card for the Now view: the top five of the same Now query the
 * Tickets home and the Today block use (spec §12). Header opens the tab.
 */
export function Now() {
  const [currentCtx] = useCurrentContext();
  const device = useDevice();
  const { prefs, isLoading: prefsLoading } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const { data } = useApi<{ tickets: TicketRowData[] }>(
    prefsLoading ? null : nowQueryUrl(tp),
  );
  const visible = orderForContext(applyNowContext(data?.tickets ?? [], chipsFor(tp, device)), currentCtx, device).slice(0, 5);

  return (
    <Panel
      borderless
      title="NOW"
      topRight={
        <Link
          href="/organisation/tickets"
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
        >
          OPEN →
        </Link>
      }
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
        {device} · {tp.now_where}
        {tp.now_max_points != null ? ` · ≤${tp.now_max_points} pts` : ""}
        {tp.now_include_backlog ? " · +backlog" : ""}
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-ink-2/60">
        {!data ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            Loading…
          </li>
        ) : visible.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            Nothing fits your current context.
          </li>
        ) : (
          visible.map((task) => (
            <li key={task.id} className="py-1.5">
              <Link
                href={ticketHref(task)}
                className="flex items-center gap-2 hover:text-accent transition-colors"
              >
                <Mono className="text-[10px] text-glow-2 shrink-0">{task.ticket_key ?? ""}</Mono>
                <span className="text-sm text-ink-4 flex-1 truncate">
                  {task.title}
                </span>
                <OverduePill t={task} />
                {task.points != null && (
                  <Mono className="text-[10px] text-ink-3 shrink-0">{task.points}</Mono>
                )}
              </Link>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
