import { DraggableCardGrid } from "@/components/dashboard/DraggableCardGrid";
import { InvestmentsOverviewCard } from "@/components/finance/InvestmentsOverviewCard";

const CARDS = [
  {
    key: "snapshot",
    label: "Snapshot",
    href: "/finance/snapshot",
    description: "Net worth, accounts, recent movement.",
  },
  {
    key: "spending",
    label: "Spending",
    href: "/finance/spending",
    description: "Import bank CSVs, view transactions, categorise.",
  },
  {
    key: "analysis",
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

      <DraggableCardGrid
        section="finance"
        cards={CARDS}
        suffix={<InvestmentsOverviewCard />}
      />
    </div>
  );
}
