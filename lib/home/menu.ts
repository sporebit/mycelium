/**
 * The top menu bar of the new shell (claude/ui-direction.md §3): a
 * classical bar with dropdowns. The grouping is held in this one array so
 * it can be regrouped in a line; it is a proposal Phil may change
 * (MYC-192).
 *
 * A group with one place is a plain link; a group with several opens a
 * dropdown. Every section of the app stays reachable from here. Inner
 * pages keep their own sub-page chips.
 *
 * "Family" is in the agreed grouping under Life and joins this list when
 * its page exists (master run, the family stream).
 */

export type MenuItem = { label: string; href: string };
export type MenuGroup = { label: string; items: readonly MenuItem[] };

export const MENU_GROUPS: readonly MenuGroup[] = [
  { label: "Today", items: [{ label: "Today", href: "/" }] },
  {
    label: "Work",
    items: [
      { label: "Work", href: "/work" },
      { label: "Docs", href: "/docs" },
      { label: "Hours", href: "/organisation/hours" },
    ],
  },
  {
    label: "Life",
    items: [
      { label: "Organisation", href: "/organisation" },
      { label: "Journal", href: "/journal" },
      { label: "Places", href: "/places" },
    ],
  },
  {
    label: "Body",
    items: [
      { label: "Fitness", href: "/fitness" },
      { label: "Health", href: "/health" },
    ],
  },
  { label: "Money", items: [{ label: "Finance", href: "/finance" }] },
  {
    label: "Make",
    items: [
      { label: "Studio", href: "/studio" },
      { label: "Drops", href: "/drops" },
      { label: "Ventures", href: "/ventures" },
    ],
  },
  { label: "The Boys", items: [{ label: "The Boys", href: "/the-boys" }] },
  {
    label: "Review",
    items: [
      { label: "Capture review", href: "/organisation/captures/review" },
      { label: "Finish line", href: "/finish" },
      { label: "Close the day", href: "/close" },
      { label: "Weekly review", href: "/organisation/tickets/review" },
    ],
  },
  { label: "Settings", items: [{ label: "Settings", href: "/other/settings" }] },
];

/** Which group a path belongs to: the longest matching place wins ("/organisation/hours" is Work, not Life). */
export function groupForPath(pathname: string, groups: readonly MenuGroup[] = MENU_GROUPS): string | null {
  let best: { label: string; length: number } | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      const hit = item.href === "/" ? pathname === "/" || pathname === "/today" : pathname === item.href || pathname.startsWith(item.href + "/");
      if (hit && (!best || item.href.length > best.length)) best = { label: g.label, length: item.href.length };
    }
  }
  return best?.label ?? null;
}

/** Every place in the menu, once. */
export function menuHrefs(groups: readonly MenuGroup[] = MENU_GROUPS): string[] {
  return [...new Set(groups.flatMap((g) => g.items.map((i) => i.href)))];
}
