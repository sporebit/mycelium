"use client";

/**
 * The top menu bar of the new shell (claude/ui-direction.md §3): a
 * classical bar with dropdowns. Groups come from one config array
 * (lib/home/menu.ts). A group with one place is a link; a group with
 * several opens a dropdown. Sections that have gone quiet keep their mark
 * here, with how long.
 *
 * Keyboard: Tab reaches every group; Enter or Space opens a dropdown;
 * Escape closes it and returns focus; arrow keys move within it. A click
 * outside closes it.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGoneQuiet } from "@/components/dashboard/GoneQuiet";
import { PrivacyToggle } from "@/components/dashboard/PrivacyToggle";
import { NotificationBell } from "@/components/work/NotificationBell";
import { groupForPath, MENU_GROUPS, placeForPath } from "@/lib/home/menu";

function openCapture() {
  window.dispatchEvent(new Event("open-capture"));
}

export function TopMenu() {
  const pathname = usePathname();
  // The open dropdown is remembered with the page it was opened on, so moving to another page closes it
  // without an effect having to notice.
  const [opened, setOpened] = useState<{ group: string; at: string } | null>(null);
  const open = opened && opened.at === pathname ? opened.group : null;
  const setOpen = (group: string | null) => setOpened(group ? { group, at: pathname } : null);
  const bar = useRef<HTMLElement | null>(null);
  const { data: dormant } = useGoneQuiet();
  const quiet = new Map((dormant?.quiet ?? []).map((f) => [f.href, f.how_long ?? ""]));
  const here = groupForPath(pathname);

  // Close on a click outside and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpened(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const group = open;
      setOpened(null);
      bar.current?.querySelector<HTMLButtonElement>(`[data-group="${group}"]`)?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[(at + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
  };

  return (
    <header
      ref={bar}
      className="sticky top-0 z-40 hidden h-[60px] items-center gap-2 border-b border-hairline bg-surface-1/95 px-5 backdrop-blur lg:flex"
      data-testid="top-menu"
    >
      <Link href="/" className="mr-3 text-[22px] font-bold tracking-[-0.01em] text-text-hi" aria-label="Mycelium, home">
        Mycelium
      </Link>
      <nav aria-label="Main menu" className="flex items-center gap-0.5">
        {MENU_GROUPS.map((g) => {
          const active = here === g.label;
          const base = `flex min-h-[44px] items-center gap-1.5 rounded-v2-md px-3 text-[15px] font-semibold transition-colors ${
            active ? "bg-glow-wash text-text-hi" : "text-text-mid hover:bg-surface-2 hover:text-text-hi"
          }`;
          if (g.items.length === 1) {
            return (
              <Link key={g.label} href={g.items[0].href} className={base} aria-current={active ? "page" : undefined}>
                {g.label}
              </Link>
            );
          }
          const isOpen = open === g.label;
          const anyQuiet = g.items.some((i) => quiet.has(i.href));
          return (
            <div key={g.label} className="relative">
              <button type="button" data-group={g.label} aria-expanded={isOpen} aria-haspopup="true" onClick={() => setOpen(isOpen ? null : g.label)} className={base}>
                <span>{g.label}</span>
                {anyQuiet ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-text-lo" /> : null}
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isOpen ? (
                <div
                  role="group"
                  aria-label={g.label}
                  onKeyDown={onMenuKey}
                  className="absolute left-0 top-[52px] flex min-w-[232px] flex-col rounded-v2-lg border border-hairline bg-surface-2 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
                >
                  {g.items.map((it) => {
                    const q = quiet.get(it.href);
                    const current = it.href === placeForPath(pathname, g.items);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        aria-current={current ? "page" : undefined}
                        className={`flex min-h-[44px] items-baseline justify-between gap-4 rounded-v2-md px-3 py-2.5 text-[15px] hover:bg-surface-1 ${current ? "text-text-hi" : "text-text-mid"}`}
                      >
                        <span>{it.label}</span>
                        {q ? <span className="text-[12.5px] text-text-lo">quiet {q}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="flex-1" />
      {/* finance amounts are hidden until this is pressed, as in the classic sidebar */}
      <PrivacyToggle />
      <NotificationBell />
      <button
        type="button"
        onClick={openCapture}
        className="ml-2 min-h-[44px] rounded-v2-md bg-text-hi px-5 text-[15px] font-bold text-surface-0 transition-transform active:scale-[0.97]"
      >
        Capture
      </button>
    </header>
  );
}
