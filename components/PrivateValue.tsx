"use client";

import type { ReactNode } from "react";
import { usePrivacy } from "@/lib/context/PrivacyContext";

/**
 * Wraps a monetary value. When privacy mode is on, blurs the value in place
 * (preserves layout width) so the user knows the number is there but can't
 * read it. Pass `fallback` to substitute a different placeholder instead.
 */
export function PrivateValue({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { financeHidden } = usePrivacy();
  if (!financeHidden) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  return (
    <span
      aria-label="Hidden value"
      className="select-none pointer-events-none inline-block align-baseline"
      style={{ filter: "blur(6px)" }}
    >
      {children}
    </span>
  );
}
