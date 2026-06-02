"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  { label: "OVERVIEW", href: "/compost" },
  { label: "PEOPLE", href: "/compost/people" },
  { label: "TASKS", href: "/compost/tasks" },
  { label: "PROJECTS", href: "/compost/projects" },
  { label: "PURCHASES", href: "/compost/purchases" },
  { label: "CAPTURES", href: "/compost/captures" },
  { label: "REVIEW", href: "/compost/captures/review" },
  { label: "DECISIONS", href: "/compost/decisions" },
];

export function SubNav() {
  return (
    <SubNavRail
      tabs={TABS}
      defaultMatch={(pathname, t) =>
        pathname === t.href ||
        (t.href !== "/compost" && pathname.startsWith(`${t.href}/`))
      }
    />
  );
}
