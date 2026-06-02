"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  { label: "OVERVIEW", href: "/fitness/overview" },
  {
    label: "TODAY",
    href: "/fitness",
    // /fitness is TODAY — exact match only, so /fitness/overview
    // doesn't trigger TODAY's active state.
    match: (p) => p === "/fitness",
  },
  { label: "CALENDAR", href: "/fitness/calendar" },
  { label: "HISTORY", href: "/fitness/history" },
  { label: "WORKOUTS", href: "/fitness/workouts" },
  { label: "PROGRAMMES", href: "/fitness/programmes" },
  { label: "PHASES", href: "/fitness/phases" },
  { label: "BODY", href: "/fitness/body" },
];

export function FitnessSubNav() {
  return <SubNavRail tabs={TABS} />;
}
