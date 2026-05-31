import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Tasks",
    href: "/compost/tasks",
    description: "Daily driver — list, kanban, table, calendar.",
  },
  {
    label: "Projects",
    href: "/compost/projects",
    description: "Containers for task collections and rolled-up budgets.",
  },
  {
    label: "Purchases",
    href: "/compost/purchases",
    description: "Shopping list, wishlist, and bills tracked together.",
  },
  {
    label: "Captures",
    href: "/compost/captures",
    description: "Raw voice and text input before it's routed.",
  },
  {
    label: "Review",
    href: "/compost/captures/review",
    description: "Triage queue for ambiguous captures.",
  },
  {
    label: "Decisions",
    href: "/compost/decisions",
    description: "Choices you logged so you can find them later.",
  },
  {
    label: "People",
    href: "/compost/people",
    description: "Rolodex of mentions, captures, and shared context.",
  },
];

export default function CompostOverviewPage() {
  return (
    <SectionOverview
      title="Compost"
      tagline="Where captured fragments break down into tasks, projects, and people."
      cards={CARDS}
    />
  );
}
