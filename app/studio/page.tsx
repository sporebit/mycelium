import { DraggableCardGrid } from "@/components/dashboard/DraggableCardGrid";
import { PCOverviewCard } from "@/components/studio/PCOverviewCard";
import { sectionCards } from "@/lib/nav/cards";

// Every Studio page in the sidebar gets a box (lib/nav/cards.ts).
// The PC build is the live card in the suffix, so it is not a plain box as well.
const CARDS = sectionCards("studio", { omit: ["/studio/pc"] });

export default function StudioPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-hi">
          Studio
        </h1>
        <p className="text-sm text-text-lo italic font-[family-name:var(--font-display)]">
          Music, media, hardware, and creative tools.
        </p>
      </header>

      <DraggableCardGrid
        section="studio"
        cards={CARDS}
        suffix={<PCOverviewCard />}
      />
    </div>
  );
}
