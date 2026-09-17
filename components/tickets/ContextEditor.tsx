"use client";

import { useState } from "react";
import {
  POINTS,
  TIME_WINDOWS,
  TIME_WINDOW_LABEL,
  TOOL_GLYPH,
  TOOL_PRESETS,
  WHERE_CTX,
  WHERE_GLYPH,
  WHERE_LABEL,
  type TimeWindow,
  type WhereCtx,
} from "@/lib/tickets/categories";

export type ContextValue = {
  where_ctx: WhereCtx;
  tools: string[];
  time_window: TimeWindow;
  time_from?: string | null;
  time_to?: string | null;
  days?: number[] | null;
  points: number | null;
};

export function Pill({
  active,
  onClick,
  title,
  children,
  tone = "glow",
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  tone?: "glow" | "accent";
}) {
  const on =
    tone === "accent"
      ? "border-accent/50 bg-accent/15 text-accent"
      : "border-glow-2/50 bg-glow-2/15 text-glow-2";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active ? on : "border-ink-2 bg-ink-0/40 text-ink-3 hover:border-ink-3 hover:text-ink-4"
      }`}
    >
      {children}
    </button>
  );
}

const DAY_LABEL = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Where · Tool · Time window · Points — the three GTD facets plus effort
 * (spec §3.3). Controlled: the parent owns the value and decides when to
 * persist (Clarify saves on Defer; the ticket page saves on each change).
 */
export function ContextEditor({
  value,
  onChange,
  compact = false,
}: {
  value: ContextValue;
  onChange: (next: ContextValue) => void;
  compact?: boolean;
}) {
  const [toolDraft, setToolDraft] = useState("");
  const tools = value.tools.filter((t) => t !== "none");
  const custom = tools.filter((t) => !(TOOL_PRESETS as readonly string[]).includes(t));

  const setTools = (next: string[]) =>
    onChange({ ...value, tools: next.length ? Array.from(new Set(next)) : ["none"] });
  const toggleTool = (t: string) =>
    setTools(tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t]);
  const addCustom = () => {
    const t = toolDraft.trim().toLowerCase();
    if (!t) return;
    setTools([...tools, t]);
    setToolDraft("");
  };

  const row = compact ? "flex flex-wrap items-center gap-x-4 gap-y-2" : "flex flex-col gap-3";

  return (
    <div className={row}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">Where</span>
        {WHERE_CTX.filter((w) => w !== "place").map((w) => (
          <Pill key={w} active={value.where_ctx === w} onClick={() => onChange({ ...value, where_ctx: w })}>
            {WHERE_GLYPH[w]} {WHERE_LABEL[w]}
          </Pill>
        ))}
        {value.where_ctx === "place" && <Pill active onClick={() => {}}>{WHERE_GLYPH.place} Place</Pill>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">Tool</span>
        <Pill active={tools.length === 0} onClick={() => setTools([])} title="No particular tool">
          {TOOL_GLYPH.none} none
        </Pill>
        {TOOL_PRESETS.filter((t) => t !== "none").map((t) => (
          <Pill key={t} active={tools.includes(t)} onClick={() => toggleTool(t)}>
            {TOOL_GLYPH[t]} {t}
          </Pill>
        ))}
        {custom.map((t) => (
          <Pill key={t} active onClick={() => toggleTool(t)} title="Remove">
            #{t} ×
          </Pill>
        ))}
        <input
          className="w-24 rounded-full border border-ink-2 bg-ink-0/40 px-2.5 py-1 text-[11px] text-ink-4 outline-none placeholder:text-ink-3 focus:border-glow-2/50"
          placeholder="+ tool"
          value={toolDraft}
          onChange={(e) => setToolDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          onBlur={addCustom}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">When</span>
        {TIME_WINDOWS.map((w) => (
          <Pill key={w} active={value.time_window === w} onClick={() => onChange({ ...value, time_window: w })}>
            {TIME_WINDOW_LABEL[w]}
          </Pill>
        ))}
      </div>
      {value.time_window === "custom" && (
        <div className="flex flex-wrap items-center gap-1.5 pl-14">
          <input
            type="time"
            className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0"
            value={value.time_from ?? ""}
            onChange={(e) => onChange({ ...value, time_from: e.target.value || null })}
          />
          <span className="text-[11px] text-ink-3">to</span>
          <input
            type="time"
            className="rounded-sm bg-ink-2 px-2 py-1 text-[11px] text-text-0"
            value={value.time_to ?? ""}
            onChange={(e) => onChange({ ...value, time_to: e.target.value || null })}
          />
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = (value.days ?? []).includes(d);
            return (
              <Pill
                key={d}
                active={on}
                onClick={() => {
                  const cur = value.days ?? [];
                  const next = on ? cur.filter((x) => x !== d) : [...cur, d].sort();
                  onChange({ ...value, days: next.length ? next : null });
                }}
              >
                {DAY_LABEL[d]}
              </Pill>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">Points</span>
        {POINTS.map((p) => (
          <Pill
            key={p}
            tone="accent"
            active={value.points === p}
            onClick={() => onChange({ ...value, points: value.points === p ? null : p })}
          >
            {p}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export function contextOf(t: {
  where_ctx?: string;
  tools?: string[];
  time_window?: string;
  time_from?: string | null;
  time_to?: string | null;
  days?: number[] | null;
  points?: number | null;
}): ContextValue {
  return {
    where_ctx: ((t.where_ctx as WhereCtx) ?? "anywhere") as WhereCtx,
    tools: t.tools?.length ? t.tools : ["none"],
    time_window: ((t.time_window as TimeWindow) ?? "anytime") as TimeWindow,
    time_from: t.time_from ?? null,
    time_to: t.time_to ?? null,
    days: t.days ?? null,
    points: t.points ?? null,
  };
}
