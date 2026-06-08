"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/brain",
    match: (p) => p === "/brain",
  },
  { label: "ASK", href: "/brain/ask" },
  { label: "RULES", href: "/brain/rules" },
  { label: "ENTITY RULES", href: "/brain/entity-rules" },
  { label: "INTEGRATIONS", href: "/brain/integrations" },
];

export function StromaSubNav() {
  return <SubNavRail tabs={TABS} />;
}
