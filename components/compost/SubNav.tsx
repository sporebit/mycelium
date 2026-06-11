"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  { label: "OVERVIEW", href: "/organisation" },
  { label: "PEOPLE", href: "/organisation/people" },
  { label: "TASKS", href: "/organisation/tasks" },
  { label: "PROJECTS", href: "/organisation/projects" },
  { label: "PURCHASES", href: "/organisation/purchases" },
  { label: "CAPTURES", href: "/organisation/captures" },
  { label: "REVIEW", href: "/organisation/captures/review" },
  { label: "DECISIONS", href: "/organisation/decisions" },
  { label: "ASSISTANT", href: "/organisation/assistant" },
];

export function SubNav() {
  return (
    <SubNavRail
      tabs={TABS}
      defaultMatch={(pathname, t) =>
        pathname === t.href ||
        (t.href !== "/organisation" && pathname.startsWith(`${t.href}/`))
      }
    />
  );
}
