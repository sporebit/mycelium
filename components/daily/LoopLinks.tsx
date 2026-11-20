import Link from "next/link";

/**
 * The three doors of the daily loop, on the dashboard of the current shell.
 * The new shell has Today as its first menu item; until that is switched on
 * these pages are otherwise reached only from a notification.
 */
const LINKS: Array<{ href: string; label: string; hint: string }> = [
  { href: "/today", label: "Today", hint: "the one thing, and what comes next" },
  { href: "/finish", label: "Finish line", hint: "nearly done: close one" },
  { href: "/close", label: "Close the day", hint: "two minutes, in the evening" },
];

export function LoopLinks() {
  return (
    <nav aria-label="Today" className="mb-4 flex flex-wrap gap-2" data-testid="loop-links">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="group flex min-h-[44px] flex-col justify-center rounded-v2-md border border-hairline bg-surface-1 px-4 py-2 transition-colors hover:bg-surface-2"
        >
          <span className="text-sm text-text-hi">{l.label}</span>
          <span className="text-[12px] text-text-lo">{l.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
