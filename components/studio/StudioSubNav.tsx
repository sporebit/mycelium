"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/studio",
    match: (p) => p === "/studio",
  },
  {
    label: "SPOTIFY",
    href: "/studio/spotify",
    match: (p) => p === "/studio/spotify" || p.startsWith("/studio/spotify/"),
  },
  {
    label: "ENGINEER",
    href: "/the-boys/engineer",
    match: (p) => p === "/the-boys/engineer",
  },
];

export function StudioSubNav() {
  return <SubNavRail tabs={TABS} />;
}
