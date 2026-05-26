import Link from "next/link";
import type { ComponentType } from "react";
import { LiveClock } from "./LiveClock";
import { Tickers } from "./Tickers";
import { SunWidget } from "./SunWidget";
import { PrivacyToggle } from "./PrivacyToggle";
import { Wordmark } from "./Wordmark";
import { HomeIcon } from "@/components/icons/nav/HomeIcon";
import { CompostIcon } from "@/components/icons/nav/CompostIcon";
import { FitnessIcon } from "@/components/icons/nav/FitnessIcon";
import { BrainIcon } from "@/components/icons/nav/BrainIcon";
import { JournalIcon } from "@/components/icons/nav/JournalIcon";
import type { NavIconProps } from "@/components/icons/nav/types";

type Tab = {
  label: string;
  href: string;
  Icon?: ComponentType<NavIconProps>;
};

const TABS: Tab[] = [
  { label: "HOME", href: "/", Icon: HomeIcon },
  { label: "COMPOST", href: "/compost", Icon: CompostIcon },
  { label: "FINANCE", href: "/finance" },
  { label: "REVIEW", href: "/review" },
  { label: "HEALTH", href: "/health" },
  { label: "BRAIN", href: "/brain", Icon: BrainIcon },
  { label: "JOURNAL", href: "/journal", Icon: JournalIcon },
  { label: "FITNESS", href: "/fitness", Icon: FitnessIcon },
];

export function TopRail({ active = "HOME" }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-ink-1/85 backdrop-blur-xl shadow-[0_1px_0_0_var(--ink-2)]">
      <div className="mx-auto max-w-[1400px] flex items-center gap-5 px-6 py-3">
        <Wordmark />

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const isActive = t.label === active;
            const Icon = t.Icon;
            return (
              <Link
                key={t.label}
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-[0.04em] uppercase rounded-md transition-colors ${
                  isActive
                    ? "bg-ink-2 text-accent"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/70"
                }`}
              >
                {Icon && (
                  <Icon
                    size={16}
                    ariaLabel={t.label}
                    active={isActive}
                    className="shrink-0"
                  />
                )}
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Tickers */}
        <Tickers />

        <div className="hidden lg:block h-5 w-px bg-ink-2" />

        {/* Sunrise / sunset */}
        <SunWidget />

        {/* Finance privacy toggle */}
        <PrivacyToggle />

        <div className="hidden lg:block h-5 w-px bg-ink-2" />

        {/* Date / time */}
        <div className="hidden lg:flex flex-col items-end leading-tight">
          <LiveClock format="date" className="text-[10px] text-ink-3" />
          <LiveClock format="time" className="text-xs text-ink-4" />
        </div>

        {/* Avatar */}
        <div className="h-8 w-8 rounded-full bg-ink-2 border border-ink-2 flex items-center justify-center text-[11px] font-[family-name:var(--font-mono)] text-ink-4">
          P
        </div>
      </div>
    </header>
  );
}
