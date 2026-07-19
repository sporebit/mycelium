import type { ReactNode } from "react";

export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo font-[family-name:var(--font-inter-tight)] ${className}`}
    >
      {children}
    </span>
  );
}
