import { SectionOverview } from "@/components/dashboard/SectionOverview";
import { sectionCards } from "@/lib/nav/cards";

// Every Fitness page in the sidebar gets a box (lib/nav/cards.ts). This
// overview is not the section's base page, so Today is a box here too.
const CARDS = sectionCards("fitness", { includeBase: true });

export default function FitnessOverviewPage() {
  return (
    <SectionOverview
      title="Fitness"
      tagline="Logged training, periodisation, and the body that's doing the lifting."
      section="fitness"
      cards={CARDS}
    />
  );
}
