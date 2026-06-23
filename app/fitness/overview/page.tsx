import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    key: "today",
    label: "Today",
    href: "/fitness",
    description: "Current session, planned workouts, quick log.",
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/fitness/calendar",
    description: "Month view of every completed and planned session.",
  },
  {
    key: "history",
    label: "History",
    href: "/fitness/history",
    description: "Past sessions and per-exercise progression.",
  },
  {
    key: "programmes",
    label: "Programmes",
    href: "/fitness/programmes",
    description: "Training plan templates and phase definitions.",
  },
  {
    key: "phases",
    label: "Phases",
    href: "/fitness/phases",
    description: "Long-arc periodisation: bulks, cuts, maintenance.",
  },
  {
    key: "body",
    label: "Body",
    href: "/fitness/body",
    description: "Weight, measurements, and body composition over time.",
  },
];

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
