"use client";

import { OverduePill } from "@/components/tickets/OverduePill";
import { useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { Surface, Button, Skeleton, Sheet, Label } from "@/components/ui";
import type { Task } from "@/lib/types/task";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import {
  ENERGY_CHIPS,
  TIME_WINDOW_LABEL,
  WHERE_GLYPH,
  WHERE_LABEL,
  type TimeWindow,
  type WhereCtx,
} from "@/lib/tickets/categories";
import { triggerFieldPulse } from "@/lib/motion";
import { applyNowContext, chipsFor, nowQueryUrl, orderForContext } from "@/components/tickets/nowQuery";
import { useDevice } from "@/components/tickets/useDevice";
import { ticketHref, type TicketRowData } from "@/components/tickets/TicketListRow";

type NowResponse = { tickets: TicketRowData[] };
type NowWhere = "home" | "out" | "anywhere";
const WHERE_CHIPS: NowWhere[] = ["home", "out", "anywhere"];

/**
 * Today surface → the Now query (spec §12): the same list as the Now tab,
 * top three, with the sticky Where and Energy shared through
 * ui_prefs.tickets. The FROZEN scorer orders the pre-filtered set.
 */
export function NowBlock() {
  const [currentCtx] = useCurrentContext();
  const device = useDevice();
  const { prefs, setPrefs, isLoading: prefsLoading } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const key = nowQueryUrl(tp);
  const { data, isLoading } = useApi<NowResponse>(prefsLoading ? null : key);
  const [openInfoFor, setOpenInfoFor] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());

  const ordered = orderForContext(applyNowContext(data?.tickets ?? [], chipsFor(tp, device)), currentCtx, device);
  const top = ordered.slice(0, 3);

  async function complete(task: Task) {
    setFadingOut((s) => new Set(s).add(task.id));
    const ref = encodeURIComponent(task.ticket_key ?? task.id);
    try {
      await globalMutate<NowResponse>(
        key,
        async (current) => {
          const res = await fetch(`/api/tickets/${ref}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (!res.ok) throw new Error(`complete failed (${res.status})`);
          triggerFieldPulse(window.innerWidth / 2, window.innerHeight - 40);
          return { tickets: (current?.tickets ?? []).filter((t) => t.id !== task.id) };
        },
        {
          optimisticData: (current) => ({
            tickets: (current?.tickets ?? []).filter((t) => t.id !== task.id),
          }),
          rollbackOnError: true,
          revalidate: true,
        },
      );
      void globalMutate("/api/tickets/counts");
    } finally {
      setFadingOut((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  }

  const infoTask = top.find((t) => t.id === openInfoFor) ?? null;

  return (
    <Surface level={1} className="p-5 mb-4">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <Label>Now</Label>
        <div className="flex items-center gap-1.5">
          {WHERE_CHIPS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={tp.now_where === w}
              title={WHERE_LABEL[w]}
              onClick={() => void setPrefs({ tickets: { ...tp, now_where: w } })}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                tp.now_where === w
                  ? "border-glow-2/50 bg-glow-2/15 text-glow-2"
                  : "border-ink-2 text-ink-3 hover:text-ink-4"
              }`}
            >
              {WHERE_GLYPH[w]}
            </button>
          ))}
          <select
            aria-label="Energy"
            className="rounded-full border border-ink-2 bg-transparent px-1.5 py-0.5 text-[10px] text-ink-3"
            value={tp.now_max_points == null ? "all" : String(tp.now_max_points)}
            onChange={(e) =>
              void setPrefs({
                tickets: { ...tp, now_max_points: e.target.value === "all" ? null : Number(e.target.value) },
              })
            }
          >
            {ENERGY_CHIPS.map((c) => (
              <option key={c.label} value={c.value == null ? "all" : String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
          <Link
            href="/organisation/tickets"
            className="ml-1 text-[10px] uppercase tracking-[0.08em] text-text-lo hover:text-text-hi font-[family-name:var(--font-jetbrains-mono)]"
          >
            Open →
          </Link>
        </div>
      </div>

      {isLoading || !data ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-9 w-full" />
            </li>
          ))}
        </ul>
      ) : top.length === 0 ? (
        <Surface level={2} border={false} className="px-4 py-6 text-center">
          <div className="text-sm text-text-mid">
            Nothing fits right now.{" "}
            <Link
              href="/organisation/tickets"
              className="text-text-hi underline underline-offset-2 hover:text-glow"
            >
              Open Tickets
            </Link>{" "}
            to widen a chip or clarify the Inbox.
          </div>
        </Surface>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {top.map((task) => {
            const fading = fadingOut.has(task.id);
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 py-2.5 transition-opacity duration-[var(--dur-base)] [transition-timing-function:var(--ease-out)] ${
                  fading ? "opacity-30" : "opacity-100"
                }`}
              >
                <span className="shrink-0 text-[10px] font-[family-name:var(--font-jetbrains-mono)] tracking-[0.08em] text-glow-2">
                  {task.ticket_key ?? ""}
                </span>
                <Link
                  href={ticketHref(task)}
                  className="flex-1 min-w-0 text-sm text-text-hi hover:text-glow transition-colors truncate"
                >
                  {task.title}
                </Link>
                <OverduePill t={task} />
                {task.where_ctx && task.where_ctx !== "anywhere" && (
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-v2-sm bg-surface-2 text-text-lo"
                    title={`where: ${task.where_ctx}`}
                  >
                    {WHERE_GLYPH[task.where_ctx as WhereCtx] ?? task.where_ctx}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpenInfoFor(task.id)}
                  aria-label="Why this is here"
                  className="shrink-0 h-6 w-6 rounded-full text-[11px] text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
                >
                  ?
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void complete(task)}
                  disabled={fading}
                >
                  {task.recurrence_mode === "series" ? "Log" : "Done"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!openInfoFor} onClose={() => setOpenInfoFor(null)} title="Why this is here">
        {infoTask ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="text-text-hi font-medium">
              <span className="text-glow-2 font-[family-name:var(--font-jetbrains-mono)] text-xs mr-2">
                {infoTask.ticket_key}
              </span>
              {infoTask.title}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-text-mid">
              <div>Status</div>
              <div className="text-text-hi">{infoTask.status_name ?? infoTask.category ?? "—"}</div>
              <div>Where</div>
              <div className="text-text-hi">
                {WHERE_LABEL[(infoTask.where_ctx ?? "anywhere") as WhereCtx]} · you: {tp.now_where}
              </div>
              <div>Tools</div>
              <div className="text-text-hi">
                {(infoTask.tools ?? ["none"]).join(", ")} · you: {device}
              </div>
              <div>When</div>
              <div className="text-text-hi">
                {TIME_WINDOW_LABEL[(infoTask.time_window ?? "anytime") as TimeWindow]}
              </div>
              <div>Points</div>
              <div className="text-text-hi">
                {infoTask.points ?? "—"} · cap {tp.now_max_points ?? "none"}
              </div>
              <div>Deadline</div>
              <div className="text-text-hi">{infoTask.deadline_on ?? infoTask.due_date ?? "—"}</div>
              <div>Scheduled</div>
              <div className="text-text-hi">{infoTask.scheduled_on ?? "—"}</div>
              <div>When</div>
              <div className="text-text-hi">{infoTask.due_window ?? "—"}</div>
            </div>
            <div className="text-[12px] text-text-lo italic mt-2">
              Contexts filter first (where, tools, time window, energy); the score orders what is left.
            </div>
          </div>
        ) : null}
      </Sheet>
    </Surface>
  );
}
