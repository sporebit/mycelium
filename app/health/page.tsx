import { SectionOverview } from "@/components/dashboard/SectionOverview";

const CARDS = [
  {
    label: "Nutrition",
    href: "/health/nutrition",
    description: "Daily macros, meal groups, barcode scan, foods library.",
  },
  {
    label: "Body metrics",
    href: "/fitness/body",
    description: "Weight, measurements, body composition over time.",
  },
  {
    label: "Supplements",
    href: "/health/supplements",
    description: "Active supplement stack with one-tap dose logging.",
  },
  {
    label: "Pain tracking",
    href: "/health/pain",
    description: "Standalone pain logs + recent session pain notes.",
  },
  {
    label: "Gut health",
    href: "/health/gut-health",
    description: "Bristol Scale daily log with 30-day overview strip.",
  },
  {
    label: "Blood tests",
    href: "/health/blood-tests",
    description: "Markers, ranges, and trends across sessions.",
  },
  {
    label: "Vision",
    href: "/health/eye-prescription",
    description: "Eye prescriptions and contact lens history.",
  },
  {
    label: "Recipes",
    href: "/health/recipes",
    description: "Recipe library with vision scan, meal planner, and shopping lists.",
  },
];

export default function HealthOverviewPage() {
  return (
    <SectionOverview
      title="Health"
      tagline="Bodies tracked across nutrition, metrics, and pain."
      cards={CARDS}
    />
  );
}
