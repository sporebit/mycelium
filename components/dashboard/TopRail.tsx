"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { SECTIONS } from "@/lib/nav/sections";

type NavTab = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
  colour?: string;
};

const TABS: NavTab[] = [
  {
    label: "DASHBOARD",
    href: "/",
    match: (p) => p === "/",
  },
  ...SECTIONS.flatMap((s): NavTab[] => {
    const tab: NavTab = {
      label: s.label,
      href: s.baseRoute,
      match: (p: string) => p === s.baseRoute || p.startsWith(s.baseRoute + "/"),
      colour: s.colour,
    };
    return s.key === "the-boys"
      ? [
          {
            label: "REVIEW",
            href: "/organisation/captures/review",
            match: (p: string) =>
              p === "/organisation/captures/review" ||
              p.startsWith("/organisation/captures/review/"),
            colour: "#f5b56d",
          },
          tab,
        ]
      : [tab];
  }),
];

const ABBREV: Record<string, string> = {
  ORGANISATION: "ORG",
};

export function TopRail() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    const el = activeRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      });
    }
  }, [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    function check() {
      if (!nav) return;
      const canScroll = nav.scrollWidth > nav.clientWidth;
      const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4;
      setShowFade(canScroll && !atEnd);
    }
    check();
    nav.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      nav.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 bg-ink-1/85 backdrop-blur-xl shadow-[0_1px_0_0_var(--ink-2)]"
    >
      <div className="w-full flex items-center gap-3 pl-4 sm:pl-6 pr-4 sm:pr-6 min-h-[52px]">
        <Wordmark />

        {/* Desktop: scrollable section links */}
        <div className="hidden md:flex flex-1 justify-end relative">
          <nav
            ref={navRef}
            aria-label="Primary"
            className="flex items-center gap-0.5 lg:gap-1 overflow-x-auto no-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {TABS.map((t) => {
              const isActive = t.match(pathname);
              return (
                <Link
                  key={t.label}
                  ref={isActive ? activeRef : undefined}
                  href={t.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-2 lg:px-3 text-[10px] lg:text-xs font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase rounded-md transition-colors ${
                    isActive
                      ? "bg-ink-2"
                      : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/70"
                  }`}
                  style={isActive ? { color: t.colour ?? "var(--accent)" } : undefined}
                >
                  <span className="lg:hidden">{ABBREV[t.label] ?? t.label}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </Link>
              );
            })}
          </nav>
          {showFade && (
            <div
              className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to right, transparent, color-mix(in srgb, var(--ink-1) 85%, transparent))",
              }}
            />
          )}
        </div>

        {/* Mobile: spacer + hamburger */}
        <div className="flex-1 md:hidden" />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-2/70 transition-colors"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className="text-lg leading-none">{menuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav
          aria-label="Primary"
          className="md:hidden border-t border-ink-2 bg-ink-1/95 backdrop-blur-xl"
        >
          {TABS.map((t) => {
            const isActive = t.match(pathname);
            return (
              <Link
                key={t.label}
                href={t.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-6 py-3.5 text-sm font-[family-name:var(--font-mono)] tracking-[0.08em] uppercase transition-colors border-b border-ink-2/40 ${
                  isActive ? "bg-ink-2/40" : "hover:bg-ink-2/20"
                }`}
                style={
                  isActive
                    ? { color: t.colour ?? "var(--accent)" }
                    : { color: "var(--ink-3)" }
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
