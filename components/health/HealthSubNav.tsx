"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/health",
    match: (p) => p === "/health",
  },
  {
    label: "NUTRITION",
    href: "/health/nutrition",
    match: (p) => p === "/health/nutrition" || p.startsWith("/health/nutrition/"),
  },
  {
    // Body metrics live under /fitness/body — we surface them as a Health
    // tab without duplicating the route. The active match handles both
    // surfaces.
    label: "BODY",
    href: "/fitness/body",
    match: (p) => p === "/fitness/body" || p === "/health/body",
  },
  {
    label: "SUPPLEMENTS",
    href: "/health/supplements",
    match: (p) => p === "/health/supplements" || p.startsWith("/health/supplements/"),
  },
  {
    label: "PAIN",
    href: "/health/pain",
    match: (p) => p === "/health/pain" || p.startsWith("/health/pain/"),
  },
];

export function HealthSubNav() {
  return <SubNavRail tabs={TABS} />;
}
