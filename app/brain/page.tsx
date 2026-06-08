import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Ask",
    href: "/brain/ask",
    description: "Search every capture, journal entry, decision, and note.",
  },
  {
    label: "Rules",
    href: "/brain/rules",
    description: "How voice captures get classified and routed.",
  },
  {
    label: "Integrations",
    href: "/brain/integrations",
    description: "Telegram, iOS Shortcuts, and the rest of the input layer.",
  },
];

export default function StromaOverviewPage() {
  return (
    <SectionOverview
      title="Brain"
      tagline="Search, rules, and the intelligence layer underneath everything."
      cards={CARDS}
    />
  );
}
