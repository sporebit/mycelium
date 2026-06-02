"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/stroma",
    match: (p) => p === "/stroma",
  },
  { label: "ASK", href: "/stroma/ask" },
  { label: "RULES", href: "/stroma/rules" },
  { label: "ENTITY RULES", href: "/stroma/entity-rules" },
  { label: "INTEGRATIONS", href: "/stroma/integrations" },
];

export function StromaSubNav() {
  return <SubNavRail tabs={TABS} />;
}
