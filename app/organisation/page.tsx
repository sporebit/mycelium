import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    key: "tasks",
    label: "Tasks",
    href: "/organisation/tasks",
    description: "Daily driver — list, kanban, table, calendar.",
  },
  {
    key: "projects",
    label: "Projects",
    href: "/organisation/projects",
    description: "Containers for task collections and rolled-up budgets.",
  },
  {
    key: "purchases",
    label: "Purchases",
    href: "/organisation/purchases",
    description: "Shopping list, wishlist, and bills tracked together.",
  },
  {
    key: "media",
    label: "Media",
    href: "/organisation/media",
    description: "Watch, listen, and read lists with status and ratings.",
  },
  {
    key: "captures",
    label: "Captures",
    href: "/organisation/captures",
    description: "Raw voice and text input before it's routed.",
  },
  {
    key: "review",
    label: "Review",
    href: "/organisation/captures/review",
    description: "Triage queue for ambiguous captures.",
  },
  {
    key: "decisions",
    label: "Decisions",
    href: "/organisation/decisions",
    description: "Choices you logged so you can find them later.",
  },
  {
    key: "people",
    label: "People",
    href: "/organisation/people",
    description: "Rolodex of mentions, captures, and shared context.",
  },
  {
    key: "habits",
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
      section="organisation"
      cards={CARDS}
    />
  );
}
