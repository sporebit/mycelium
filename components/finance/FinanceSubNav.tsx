"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/finance",
    match: (p) => p === "/finance",
  },
  { label: "SNAPSHOT", href: "/finance/snapshot" },
];

export function FinanceSubNav() {
  return <SubNavRail tabs={TABS} />;
}
