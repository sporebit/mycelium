"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "SETTINGS",
    href: "/other/settings",
    match: (p) => p === "/other/settings",
  },
  {
    label: "EXPORT",
    href: "/other/export",
    match: (p) => p === "/other/export",
  },
];

export function OtherSubNav() {
  return <SubNavRail tabs={TABS} />;
}
