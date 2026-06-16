import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Tasks",
    href: "/organisation/tasks",
    description: "Daily driver — list, kanban, table, calendar.",
  },
  {
    label: "Projects",
    href: "/organisation/projects",
    description: "Containers for task collections and rolled-up budgets.",
  },
  {
    label: "Purchases",
    href: "/organisation/purchases",
    description: "Shopping list, wishlist, and bills tracked together.",
  },
  {
    label: "Media",
    href: "/organisation/media",
    description: "Watch, listen, and read lists with status and ratings.",
  },
  {
    label: "Captures",
    href: "/organisation/captures",
    description: "Raw voice and text input before it's routed.",
  },
  {
    label: "Review",
    href: "/organisation/captures/review",
    description: "Triage queue for ambiguous captures.",
  },
  {
    label: "Decisions",
    href: "/organisation/decisions",
    description: "Choices you logged so you can find them later.",
  },
  {
    label: "People",
    href: "/organisation/people",
    description: "Rolodex of mentions, captures, and shared context.",
  },
  {
    label: "Habits",
    href: "/organisation/habits",
    description: "Daily practices — streaks and history.",
  },
];

export default function CompostOverviewPage() {
  return (
    <SectionOverview
      title="Organisation"
      tagline="Tasks, projects, people, and captures — your operational layer."
      cards={CARDS}
    />
  );
}
