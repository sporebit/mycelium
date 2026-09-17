"use client";

import { useCallback, useState } from "react";
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import {
  ENERGY_CHIPS,
  TOOL_GLYPH,
  TOOL_PRESETS,
  WHERE_GLYPH,
  toolsForDevice,
} from "@/lib/tickets/categories";
import type { Task } from "@/lib/types/task";
import { TicketListRow, type TicketRowData } from "./TicketListRow";
import { useDevice } from "./useDevice";

type NowWhere = "anywhere" | "home" | "out";
const WHERE_CHIPS: NowWhere[] = ["home", "out", "anywhere"];

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-glow-2/50 bg-glow-2/15 text-glow-2"
          : "border-ink-2 bg-ink-0/40 text-ink-3 hover:border-ink-3 hover:text-ink-4"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The Now view (spec §5): "what can I do right now, here, with what I've
 * got?" Where is sticky per user (ui_prefs.tickets.now_where); Tool is
 * auto-detected from the device and overridable per session; Energy caps
 * points; Include backlog widens the candidate set. The API applies the
 * contexts first; the score orders what's left.
 */
export function NowView({ simple }: { simple: boolean }) {
  const device = useDevice();
  const { prefs, setPrefs, isLoading: prefsLoading } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const where: NowWhere = tp.now_where;
  const includeBacklog = tp.now_include_backlog;

  const [toolOverride, setToolOverride] = useState<string[] | null>(null);
  const [maxPoints, setMaxPoints] = useState<number | null>(5);
  const tools = toolOverride ?? toolsForDevice(device);

  const sp = new URLSearchParams({ list: "now", where, tools: tools.join(",") });
  if (maxPoints != null) sp.set("max_points", String(maxPoints));
  if (includeBacklog) sp.set("include_backlog", "1");
  const query = `/api/tickets?${sp.toString()}`;

  const { data, error, isLoading } = useApi<{ tickets: TicketRowData[] }>(
    prefsLoading ? null : query,
  );
  const tickets = data?.tickets ?? [];

  const toggleTool = (tool: string) => {
    const next = tools.includes(tool) ? tools.filter((t) => t !== tool) : [...tools, tool];
    setToolOverride(next);
  };

  const complete = useCallback(
    async (t: Task) => {
      const key = t.ticket_key ?? t.id;
      await globalMutate<{ tickets: TicketRowData[] }>(
        query,
        async (current) => {
          const res = await fetch(`/api/tickets/${encodeURIComponent(key)}/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          if (!res.ok) throw new Error(`complete failed (${res.status})`);
          return { tickets: (current?.tickets ?? []).filter((x) => x.id !== t.id) };
        },
        {
          optimisticData: (current) => ({
            tickets: (current?.tickets ?? []).filter((x) => x.id !== t.id),
          }),
          rollbackOnError: true,
          revalidate: true,
        },
      );
      void globalMutate("/api/tickets/counts");
    },
    [query],
  );

  return (
    <div>
      {/* Chip rows */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Where</span>
          {WHERE_CHIPS.map((w) => (
            <Chip
              key={w}
              active={where === w}
              onClick={() => void setPrefs({ tickets: { ...tp, now_where: w } })}
              title={w === "anywhere" ? "Show everything regardless of place" : undefined}
            >
              {WHERE_GLYPH[w]} {w[0].toUpperCase() + w.slice(1)}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Tool</span>
          {TOOL_PRESETS.filter((t) => t !== "none").map((tool) => (
            <Chip key={tool} active={tools.includes(tool)} onClick={() => toggleTool(tool)}>
              {TOOL_GLYPH[tool]} {tool}
            </Chip>
          ))}
          {toolOverride && (
            <button
              type="button"
              onClick={() => setToolOverride(null)}
              className="text-[10px] text-ink-3 underline-offset-2 hover:underline"
              title={`Back to auto (${device})`}
            >
              auto
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Energy</span>
          {ENERGY_CHIPS.map((e) => (
            <Chip key={e.label} active={maxPoints === e.value} onClick={() => setMaxPoints(e.value)}>
              {e.label}
            </Chip>
          ))}
        </div>
        <Chip
          active={includeBacklog}
          onClick={() => void setPrefs({ tickets: { ...tp, now_include_backlog: !includeBacklog } })}
          title="Also show Backlog tickets that fit the contexts"
        >
          + backlog
        </Chip>
      </div>

      <p className="mt-2 text-[11px] text-ink-3">
        Next and Doing tickets that fit {where === "anywhere" ? "anywhere" : where}, your tools (
        {tools.join(", ") || "none"}), the time of day and your energy. Contexts filter first; the
        score orders what is left.
      </p>

      <div className="mt-4">
        {error ? (
          <p className="text-sm text-ink-3">Could not load the Now view.</p>
        ) : isLoading || !data ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
            <p className="text-sm italic text-ink-3">
              Nothing fits right now. Widen a chip, or clarify the Inbox.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tickets.map((t) => (
              <TicketListRow
                key={t.id}
                t={t}
                simple={simple}
                action={
                  <button
                    type="button"
                    onClick={() => void complete(t)}
                    title={t.recurrence_mode === "series" ? "Log today" : "Done"}
                    className="shrink-0 rounded-v2-md border border-hairline bg-surface-1 px-2.5 py-2 text-sm text-ok transition-colors hover:bg-ok/15"
                  >
                    ✓
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
