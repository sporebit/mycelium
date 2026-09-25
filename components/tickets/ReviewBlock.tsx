"use client";

import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import type { ReviewPayload } from "@/lib/tickets/review";

/**
 * The Tickets block on /review/[isoWeek] (spec §8.4, §12): the seven
 * weekly-review counts and a link to the wizard. Read-only here.
 */
export function ReviewBlock({ locked = false }: { locked?: boolean }) {
  const { data } = useApi<ReviewPayload>("/api/tickets/review");
  if (!data) return null;
  const items: Array<[string, number]> = [
    ["Inbox", data.inbox.length],
    ["Waiting", data.waiting.length],
    ["Projects w/o next", data.projectsWithoutNext.length],
    ["Someday", data.someday.length],
    ["Stale", data.stale.length],
    ["Done, unverified", data.doneUnverified.length],
    ["Week ahead", data.weekAhead.length],
  ];
  return (
    <div className="rounded-v2-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Tasks · {data.week}</span>
        {data.sealed_at ? (
          <span className="text-[11px] text-ok">review sealed</span>
        ) : (
          !locked && (
            <Link href="/organisation/tickets/review" className="text-[11px] text-glow-2 hover:underline">
              Run the weekly review →
            </Link>
          )
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
        {items.map(([label, n]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-ink-3">{label}</span>
            <span className={`font-[family-name:var(--font-mono)] ${n === 0 ? "text-ok" : "text-ink-4"}`}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
