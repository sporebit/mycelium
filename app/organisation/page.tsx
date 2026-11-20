import { SectionOverview } from "@/components/dashboard/SectionOverview";
import { sectionCards } from "@/lib/nav/cards";

// Every Organisation page in the sidebar gets a box (lib/nav/cards.ts).
// Work is kept as a box too: it was once part of this section.
const CARDS = sectionCards("organisation", {
  custom: [
    {
      key: "work",
      label: "Work",
      href: "/work",
      description: "Issues, projects, boards, sprints and docs — now its own section.",
    },
  ],
});

export default function CompostOverviewPage() {
  return (
    <SectionOverview
      title="Organisation"
      tagline="Tasks, projects, people, and captures — your operational layer."
      section="organisation"
      cards={CARDS}
    />
  );
}
