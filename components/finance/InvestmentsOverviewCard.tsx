"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Money, PrivateText } from "@/components/finance/Money";
import { Mono } from "@/components/dashboard/Mono";

type Investment = {
  id: string;
  quantity: number;
  buy_price: number;
  current_price: number | null;
  current_price_updated_at: string | null;
  sold: boolean;
  sell_price: number | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function InvestmentsOverviewCard() {
  const [investments, setInvestments] = useState<Investment[] | null>(null);

  useEffect(() => {
    fetch("/api/finance/investments", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setInvestments(j.investments ?? []))
      .catch(() => setInvestments([]));
  }, []);

  if (investments === null) {
    return <CardShell><Mono className="text-[10px] text-ink-3">Loading…</Mono></CardShell>;
  }

  if (investments.length === 0) {
    return (
      <CardShell>
        <div className="text-base text-ink-4">Investments</div>
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          No holdings yet.{" "}
          <Link href="/finance/investments" className="text-accent hover:underline">
            Add your first
          </Link>
        </div>
      </CardShell>
    );
  }

  const active = investments.filter((i) => !i.sold);
  const totalCost = active.reduce((s, i) => s + i.quantity * i.buy_price, 0);
  const totalValue = active.reduce(
    (s, i) => s + i.quantity * (i.current_price ?? i.buy_price),
    0,
  );
  const pnl = totalValue - totalCost;
  const latestUpdate = active
    .map((i) => i.current_price_updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <CardShell>
      <div className="text-base text-ink-4">Investments</div>
      <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
        Portfolio tracker — stocks, crypto, commodities, collectibles.
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] font-[family-name:var(--font-mono)]">
        <div className="text-ink-3">
          <PrivateText><Money value={totalValue} format="balance" /></PrivateText>
        </div>
        <div className={pnl >= 0 ? "text-ok" : "text-danger"}>
          <PrivateText><Money value={pnl} format="amount" /></PrivateText>
        </div>
        <Mono className="text-[9px] text-ink-3">
          {active.length} holding{active.length !== 1 ? "s" : ""}
        </Mono>
      </div>
      {latestUpdate && (
        <Mono className="text-[9px] text-ink-3 mt-1">
          Updated {timeAgo(latestUpdate)}
        </Mono>
      )}
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <Link
        href="/finance/investments"
        className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}
