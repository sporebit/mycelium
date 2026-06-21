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
  {
    label: "API USAGE",
    href: "/other/api-usage",
    match: (p) => p === "/other/api-usage",
  },
];

export function OtherSubNav() {
  return <SubNavRail tabs={TABS} />;
}
