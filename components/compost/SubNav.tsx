"use client";

import { SubNavRail, type SubNavTab } from "@/components/dashboard/SubNavRail";

const TABS: SubNavTab[] = [
  { label: "TASKS", href: "/organisation/tasks" },
  { label: "CAPTURES", href: "/organisation/captures" },
  { label: "HABITS", href: "/organisation/habits" },
  { label: "JOURNAL", href: "/journal" },
  { label: "REMINDERS", href: "/reminders" },
  { label: "REVIEW", href: "/organisation/captures/review" },
  { label: "ASSISTANT", href: "/organisation/assistant" },
];

export function SubNav() {
  return <SubNavRail tabs={TABS} />;
}
