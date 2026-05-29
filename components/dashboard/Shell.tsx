import type { ReactNode } from "react";
import { TopRail } from "./TopRail";
import { MobileHeader } from "./MobileHeader";
import { MobileTabBar } from "./MobileTabBar";
import { GlobalSearch } from "./GlobalSearch";
import { FloatingCapture } from "./FloatingCapture";

export function Shell({
  active = "HOME",
  left,
  centre,
  right,
  children,
}: {
  active?: string;
  left?: ReactNode;
  centre?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Desktop chrome (>= md) — full TopRail with tickers, weather, etc. */}
      <div className="hidden md:block">
        <TopRail active={active} />
      </div>

      {/* Mobile chrome (< md) — slim header; bottom tab bar handled below. */}
      <MobileHeader />

      <main
        className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-6"
      >
        {children ? (
          children
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] gap-4">
            <div className="flex flex-col gap-4 min-w-0">{left}</div>
            <div className="flex flex-col gap-4 min-w-0">{centre}</div>
            <div className="flex flex-col gap-4 min-w-0">{right}</div>
          </div>
        )}
      </main>

      <GlobalSearch />
      <FloatingCapture />
      <MobileTabBar />
    </div>
  );
}
