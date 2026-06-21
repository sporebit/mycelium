"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "CALENDAR",
    href: "/drops/calendar",
    match: (p) => p === "/drops/calendar",
  },
  {
    label: "WISHLIST",
    href: "/drops/wishlist",
    match: (p) => p === "/drops/wishlist",
  },
  {
    label: "RAFFLES",
    href: "/drops/raffles",
    match: (p) => p === "/drops/raffles",
  },
  {
    label: "COOK GUIDES",
    href: "/drops/cook-guides",
    match: (p) => p.startsWith("/drops/cook-guides"),
  },
  {
    label: "MONITOR",
    href: "/drops/monitor",
    match: (p) => p === "/drops/monitor",
  },
];

export function DropsSubNav() {
  return <SubNavRail tabs={TABS} />;
}
