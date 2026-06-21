import Link from "next/link";
import { InvestmentsOverviewCard } from "@/components/finance/InvestmentsOverviewCard";

const STATIC_CARDS = [
  {
    label: "Snapshot",
    href: "/finance/snapshot",
    description: "Net worth, accounts, recent movement.",
  },
  {
    label: "Spending",
    href: "/finance/spending",
    description: "Import bank CSVs, view transactions, categorise.",
  },
  {
    label: "Analysis",
    href: "/finance/analysis",
    description: "Category breakdowns, monthly trends, daily averages.",
  },
];

export default function FinanceOverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Finance
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Where every pound is accounted for, or at least loosely tracked.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STATIC_CARDS.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
            >
              <div className="text-base text-ink-4">{c.label}</div>
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
                {c.description}
              </div>
            </Link>
          </li>
        ))}
        <InvestmentsOverviewCard />
      </ul>
    </div>
  );
}
