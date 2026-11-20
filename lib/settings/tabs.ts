/**
 * Sub-sections of a settings page as URL-reflected tabs (MYC-190).
 *
 * Landing on a page selects its first tab; the rest live at `?tab=<key>`,
 * so a tab can be linked to, reloaded and returned to after a detour (the
 * reauth round trip comes back to the tab it left). A page with a tab that
 * is its own route (Teams under People & teams) gives that tab a path
 * instead of a query.
 */
export type Tab = { key: string; label: string; href: string };

/** The tab a URL selects: the first when the parameter is absent or names no tab. */
export function resolveTab(keys: readonly string[], raw: string | null | undefined): string {
  if (raw && keys.includes(raw)) return raw;
  return keys[0];
}

/** Where a tab lives: the page itself for the first tab, `?tab=` for the rest. */
export function tabHref(pathname: string, keys: readonly string[], key: string): string {
  return key === keys[0] ? pathname : `${pathname}?tab=${encodeURIComponent(key)}`;
}

/** The tabs of a page, each with its href. */
export function buildTabs(pathname: string, defs: ReadonlyArray<{ key: string; label: string; href?: string }>): Tab[] {
  const keys = defs.map((d) => d.key);
  return defs.map((d) => ({ key: d.key, label: d.label, href: d.href ?? tabHref(pathname, keys, d.key) }));
}
