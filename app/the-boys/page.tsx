import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Ask",
    href: "/the-boys/ask",
    description: "Search every capture, journal entry, decision, and note.",
  },
  {
    label: "Rules",
    href: "/the-boys/rules",
    description: "How voice captures get classified and routed.",
  },
  {
    label: "Integrations",
    href: "/the-boys/integrations",
    description: "Telegram, iOS Shortcuts, and the rest of the input layer.",
  },
];

export default function TheBoysOverviewPage() {
  return (
    <SectionOverview
      title="The Boys"
      tagline="Your AI agents — search, rules, and the intelligence layer underneath everything."
      cards={CARDS}
    />
  );
}
