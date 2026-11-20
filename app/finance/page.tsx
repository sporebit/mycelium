import { DraggableCardGrid } from "@/components/dashboard/DraggableCardGrid";
import { InvestmentsOverviewCard } from "@/components/finance/InvestmentsOverviewCard";
import { sectionCards } from "@/lib/nav/cards";

// Every Finance page in the sidebar gets a box (lib/nav/cards.ts).
// Investments is the live card in the suffix, so it is not a plain box as well.
const CARDS = sectionCards("finance", { omit: ["/finance/investments"] });

export default function FinanceOverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-hi">
          Finance
        </h1>
        <p className="text-sm text-text-lo italic font-[family-name:var(--font-display)]">
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
