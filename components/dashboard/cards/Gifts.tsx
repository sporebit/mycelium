"use client";

import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { useApi } from "@/lib/data/useApi";
import type { CardWidth } from "@/lib/dashboard/card-registry";
import type { Totals } from "@/lib/gifts/money";
import { money } from "@/lib/gifts/money";
import { personName, type OccasionRow } from "@/lib/gifts/types";

type Row = OccasionRow & { totals?: Totals };

function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

/** Dashboard card (spec §10): the next occasions, how many ideas each has, and whether anything is bought. Owner-only data: another member sees their own. */
export function Gifts({ width = 1 }: { width?: CardWidth } = {}) {
  const { data } = useApi<{ occasions: Row[] }>("/api/gift-occasions?totals=1");
  const rows = (data?.occasions ?? []).slice(0, width === 1 ? 4 : 8);
  const nothing = rows.filter((o) => (o.totals?.counts.bought ?? 0) + (o.totals?.counts.given ?? 0) === 0).length;
  return (
    <Panel
      borderless
      title="GIFTS"
      topRight={<Mono>{data ? `${rows.length} UPCOMING` : ""}</Mono>}
      bottomCTA={
        <Link href="/organisation/gifts" className="hover:text-text-hi transition-colors">
          {nothing > 0 ? `${nothing} WITH NOTHING BOUGHT →` : "GIFTS →"}
        </Link>
      }
    >
      {!data ? (
        <div className="text-xs text-text-lo italic font-[family-name:var(--font-display)] py-3">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-lo italic font-[family-name:var(--font-display)] py-2">No occasions coming up. Set a date of birth on a person and one appears.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 py-1">
          {rows.map((o) => {
            const left = daysUntil(o.occurs_on);
            const c = o.totals?.counts;
            const ideas = c ? c.idea + c.shortlisted : 0;
            const bought = c ? c.bought + c.given : 0;
            const who = personName(o.person);
            return (
              <li key={o.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-text-hi truncate">{o.name}</span>
                {who && o.kind !== "birthday" && <span className="text-text-lo truncate">{who}</span>}
                <span className="flex-1" />
                <Mono className="text-[10px] text-text-lo whitespace-nowrap">
                  {left <= 0 ? "today" : `${left}d`} · {bought > 0 ? `${bought} bought` : ideas > 0 ? `${ideas} idea${ideas === 1 ? "" : "s"}` : "nothing yet"}
                  {o.totals && o.totals.budget !== null ? ` · ${money(o.totals.committed)}/${money(o.totals.budget)}` : ""}
                </Mono>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
