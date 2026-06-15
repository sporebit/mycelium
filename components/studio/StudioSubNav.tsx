"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/studio",
    match: (p) => p === "/studio",
  },
];

export function StudioSubNav() {
  return <SubNavRail tabs={TABS} />;
}
