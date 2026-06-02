import { Shell } from "@/components/dashboard/Shell";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";
import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
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
];

export default function FinanceOverviewPage() {
  return (
    <Shell active="FINANCE">
      <FinanceSubNav />
      <SectionOverview
        title="Finance"
        tagline="Where every pound is accounted for, or at least loosely tracked."
        cards={CARDS}
      />
    </Shell>
  );
}
