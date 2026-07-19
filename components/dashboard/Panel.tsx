import type { ReactNode } from "react";
import { SectionLabel } from "./SectionLabel";
import { Surface } from "@/components/ui";

/**
 * Panel — the standard surface used for dashboard cards and sub-page panels.
 *
 * Frame is now rendered via <Surface>. Pixel-equivalent to the pre-v2 output:
 *   borderless → Surface level=1, border=false, radius=false (own rounded-md).
 *   classic    → Surface level=1, border=true, radius=false (own rounded-2xl)
 *                plus translucent bg + backdrop blur + ink-2 border colour
 *                pushed via !-important className overrides.
 *
 * SectionLabel and header/body/footer layout are unchanged.
 */
export function Panel({
  title,
  status,
  statusTone,
  topRight,
  bottomCTA,
  borderless = false,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  status?: ReactNode;
  statusTone?: "ok" | "warn" | "danger" | "muted";
  topRight?: ReactNode;
  bottomCTA?: ReactNode;
  borderless?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  // Classic variant carries extra styling Surface doesn't know about; the
  // `!` prefix guarantees these win over Surface's baseline utilities.
  const surfaceClass = borderless
    ? "relative rounded-md"
    : "relative !bg-ink-1/60 !border-ink-2 rounded-2xl backdrop-blur-xl shadow-[0_1px_0_0_var(--ink-2)_inset]";
  const headerPad = borderless ? "px-6 pt-6 pb-3" : "px-5 pt-4 pb-3";
  const bodyPad = borderless ? "px-6 pb-6" : "px-5 pb-5";
  const footerPad = borderless
    ? "px-6 py-3 border-t border-ink-2/60"
    : "px-5 py-3 border-t border-ink-2";

  return (
    <Surface
      as="section"
      level={1}
      border={!borderless}
      radius={false}
      className={`${surfaceClass} ${className}`}
    >
      {(title || topRight) && (
        <header className={`flex items-center justify-between ${headerPad}`}>
          {title ? (
            <SectionLabel
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
      <div className={`${bodyPad} ${bodyClassName}`}>{children}</div>
      {bottomCTA && (
        <footer
          className={`flex items-center justify-end gap-3 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] ${footerPad}`}
        >
          {bottomCTA}
        </footer>
      )}
    </Surface>
  );
}
