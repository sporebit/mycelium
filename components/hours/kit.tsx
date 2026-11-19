"use client";

import type { ReactNode } from "react";
import { WEEKDAY_SHORT, weekdayIndex, type EntryState } from "@/lib/hours/calc";
import { parseTicket } from "@/lib/hours/ticket";

/** Shared input look for the tracker's forms (matches the Work kit). */
export const INPUT =
  "w-full rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none focus:ring-1 focus:ring-glow-dim disabled:opacity-50";

export const INPUT_SM = `${INPUT} py-1.5 text-[13px]`;

export function Field({ label, children, htmlFor, className = "" }: { label: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-lo">
        {label}
      </label>
      {children}
    </div>
  );
}

export const STATE_DOT: Record<EntryState, string> = {
  green: "bg-ok",
  amber: "bg-v2-warn",
  red: "bg-v2-error",
  open: "border border-hairline-strong",
};

export const STATE_TITLE: Record<EntryState, string> = {
  green: "Complete and logged in Jira",
  amber: "Has time, not yet ticked Logged",
  red: "Missing a description or a ticket",
  open: "Open — no time yet",
};

/** The colour pip at the start of a Log row (spec §3 "Entry state"). */
export function StateDot({ state }: { state: EntryState }) {
  return <span aria-label={STATE_TITLE[state]} title={STATE_TITLE[state]} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATE_DOT[state]}`} />;
}

/**
 * The ticket as a link (spec §3, D3): the pasted URL when there was one,
 * else base URL + key; a non-ticket URL shows as "link".
 */
export function TicketLink({ raw, baseUrl, className = "" }: { raw: string; baseUrl: string; className?: string }) {
  const t = parseTicket(raw, baseUrl);
  if (!raw.trim()) return <span className={`text-text-lo ${className}`}>—</span>;
  const label = t.isPlainLink ? "link" : (t.key ?? raw);
  if (!t.url) return <span className={`font-[family-name:var(--font-mono)] ${className}`}>{label}</span>;
  return (
    <a
      href={t.url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className={`font-[family-name:var(--font-mono)] text-glow hover:underline ${className}`}
      title={raw}
    >
      {label}
    </a>
  );
}

/** `Wed 19 Nov` */
export function dateLabel(key: string, withYear = false): string {
  const [y, m, d] = key.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}) });
  return `${WEEKDAY_SHORT[weekdayIndex(key)]} ${s}`;
}

/** `19 Nov` */
export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "error" | "neutral"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-ok text-ok"
      : tone === "warn"
        ? "border-v2-warn text-v2-warn"
        : tone === "error"
          ? "border-v2-error text-v2-error"
          : "border-hairline-strong text-text-mid";
  return (
    <span className={`inline-flex items-center rounded-v2-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] font-[family-name:var(--font-mono)] ${cls}`}>
      {children}
    </span>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-v2-lg border border-hairline p-4 flex flex-col gap-3 ${className}`}>
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          {title && <h2 className="text-sm font-semibold text-text-hi">{title}</h2>}
          {aside && <div className="text-xs text-text-lo">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
