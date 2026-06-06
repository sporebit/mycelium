import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Ask",
    href: "/stroma/ask",
    description: "Search every capture, journal entry, decision, and note.",
  },
  {
    label: "Rules",
    href: "/stroma/rules",
    description: "How voice captures get classified and routed.",
  },
  {
    label: "Integrations",
    href: "/stroma/integrations",
    description: "Telegram, iOS Shortcuts, and the rest of the input layer.",
  },
];

export default function StromaOverviewPage() {
  return (
    <SectionOverview
      title="Stroma"
      tagline="The fungal layer underneath everything — search, rules, and inputs."
      cards={CARDS}
    />
  );
}
