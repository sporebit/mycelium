"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/finance",
    match: (p) => p === "/finance",
  },
  { label: "SPENDING", href: "/finance/spending" },
  { label: "ANALYSIS", href: "/finance/analysis" },
  { label: "FUEL", href: "/finance/fuel" },
  { label: "ADVISOR", href: "/finance/advisor" },
];

export function FinanceSubNav() {
  return <SubNavRail tabs={TABS} />;
}
