import type { ReactNode } from "react";
import { SectionLabel } from "./SectionLabel";

export function Panel({
  number,
  title,
  status,
  statusTone,
  topRight,
  bottomCTA,
  children,
  className = "",
  bodyClassName = "",
}: {
  number?: string;
  title?: string;
  status?: ReactNode;
  statusTone?: "ok" | "warn" | "danger" | "muted";
  topRight?: ReactNode;
  bottomCTA?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`relative rounded-2xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl shadow-[0_1px_0_0_oklch(0.20_0_0)_inset] ${className}`}
    >
      {(title || topRight) && (
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          {title ? (
            <SectionLabel
              number={number}
              title={title}
              status={status}
              statusTone={statusTone}
            />
          ) : (
            <span />
          )}
          {topRight && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              {topRight}
            </div>
          )}
        </header>
      )}
      <div className={`px-5 pb-5 ${bodyClassName}`}>{children}</div>
      {bottomCTA && (
        <footer className="flex items-center justify-end gap-3 px-5 py-3 border-t border-ink-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {bottomCTA}
        </footer>
      )}
    </section>
  );
}
