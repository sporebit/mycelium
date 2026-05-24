import Link from "next/link";
import { LiveClock } from "./LiveClock";
import { Tickers } from "./Tickers";
import { SunWidget } from "./SunWidget";
import { PrivacyToggle } from "./PrivacyToggle";

const TABS = [
  { label: "HOME", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "FINANCE", href: "/finance" },
  { label: "REVIEW", href: "/review" },
  { label: "HEALTH", href: "/health" },
  { label: "BRAIN", href: "/brain" },
];

export function TopRail({ active = "HOME" }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-2 bg-ink-0/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1400px] flex items-center gap-5 px-6 py-3">
        {/* Brand */}
        <div className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.2em] text-ink-4">
          MYCELIUM
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const isActive = t.label === active;
            return (
              <Link
                key={t.label}
                href={t.href}
                className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
                  isActive
                    ? "bg-ink-2 text-ink-4"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-1"
                }`}
              >
                {t.label}
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
