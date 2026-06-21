"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  {
    label: "OVERVIEW",
    href: "/ventures",
    match: (p) => p === "/ventures",
  },
  {
    label: "TREE",
    href: "/ventures/tree",
    match: (p) => p === "/ventures/tree",
  },
  {
    label: "INSPIRATION",
    href: "/ventures/inspiration",
    match: (p) => p === "/ventures/inspiration",
  },
  {
    label: "ADS",
    href: "/ventures/ads",
    match: (p) => p === "/ventures/ads",
  },
];

export function VenturesSubNav() {
  return <SubNavRail tabs={TABS} />;
}
