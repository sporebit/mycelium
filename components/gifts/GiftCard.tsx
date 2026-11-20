"use client";

import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { money } from "@/lib/gifts/money";
import { personName, type GiftRow, type GiftStatus } from "@/lib/gifts/types";

export function giftFor(g: GiftRow): string | null {
  return personName(g.person) ?? g.for_label ?? null;
}

export function giftOccasion(g: GiftRow): { id: string; name: string; occurs_on: string } | null {
  const o = Array.isArray(g.occasion) ? (g.occasion[0] ?? null) : (g.occasion ?? null);
  return o ?? null;
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const STATUS_STYLE: Record<GiftStatus, string> = {
  idea: "border-text-hi text-text-lo",
  shortlisted: "border-glow-2/50 text-glow-1 bg-glow-3/40",
  bought: "border-ok/40 text-ok bg-ok/10",
  given: "border-accent/60 text-accent bg-accent/10",
  rejected: "border-error/50 text-error",
};

export function StatusBadge({ status }: { status: GiftStatus }) {
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${STATUS_STYLE[status]}`}>{status}</span>;
}

/** One gift idea in a list (spec §10): title, who it is for, the occasion and when, the price, the status. */
export function GiftCard({ g, onOpen, showPerson = true, showOccasion = true }: { g: GiftRow; onOpen?: (g: GiftRow) => void; showPerson?: boolean; showOccasion?: boolean }) {
  const who = giftFor(g);
  const occ = giftOccasion(g);
  return (
    <article data-testid="gift-card" className={`rounded-md bg-surface-1 p-4 flex flex-col gap-2 ${g.status === "rejected" ? "opacity-60" : ""}`}>
      <button type="button" onClick={() => onOpen?.(g)} className="text-left">
        <p className="font-[family-name:var(--font-display)] text-lg leading-snug text-text-hi">{g.title}</p>
      </button>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showPerson &&
          (g.for_person_id ? (
            <Link href={`/organisation/people/${g.for_person_id}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-text-mid hover:text-text-hi">
              {who ?? "person"}
            </Link>
          ) : who ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text-mid">{who}</span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text-lo italic">nobody yet</span>
          ))}
        {showOccasion && occ && (
          <span className="text-text-lo">
            {occ.name} · {fmtDay(occ.occurs_on)}
          </span>
        )}
        {!occ && g.needed_by && <span className="text-text-lo">by {fmtDay(g.needed_by)}</span>}
        {g.target_price !== null && <Mono className="text-[10px] text-text-lo">{money(g.target_price, g.currency)}</Mono>}
        {typeof g.comment_count === "number" && g.comment_count > 0 && <Mono className="text-[10px] text-text-lo">{g.comment_count} note{g.comment_count === 1 ? "" : "s"}</Mono>}
        <span className="flex-1" />
        <StatusBadge status={g.status} />
      </div>
      {g.reason && <div className="text-xs text-text-lo">{g.reason}</div>}
    </article>
  );
}
