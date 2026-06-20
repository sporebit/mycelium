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
    label: "NUTRITIONIST",
    href: "/the-boys/nutrition",
    match: (p) => p === "/the-boys/nutrition",
  },
  {
    label: "SUPPLEMENTS",
    href: "/health/supplements",
    match: (p) => p === "/health/supplements" || p.startsWith("/health/supplements/"),
  },
  {
    label: "BODY",
    href: "/fitness/body",
    match: (p) => p === "/fitness/body" || p === "/health/body",
  },
  {
    label: "GUT HEALTH",
    href: "/health/gut-health",
    match: (p) => p === "/health/gut-health" || p.startsWith("/health/gut-health/"),
  },
  {
    label: "BLOOD TESTS",
    href: "/health/blood-tests",
    match: (p) => p === "/health/blood-tests" || p.startsWith("/health/blood-tests/"),
  },
  {
    label: "VISION",
    href: "/health/eye-prescription",
    match: (p) => p === "/health/eye-prescription" || p.startsWith("/health/eye-prescription/"),
  },
  {
    label: "RECIPES",
    href: "/health/recipes",
    match: (p) => p === "/health/recipes" || p.startsWith("/health/recipes/"),
  },
  {
    label: "SHOPPING LISTS",
    href: "/health/shopping-lists",
    match: (p) => p === "/health/shopping-lists" || p.startsWith("/health/shopping-lists/"),
  },
];

export function HealthSubNav() {
  return <SubNavRail tabs={TABS} />;
}
