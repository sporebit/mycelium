"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-glow text-surface-0 hover:brightness-95 border border-transparent",
  ghost:
    "bg-transparent text-text-mid border border-hairline-strong hover:bg-surface-2 hover:text-text-hi",
  danger:
    "bg-transparent text-v2-error border border-v2-error hover:bg-surface-2",
};

const SIZE: Record<Size, string> = {
  sm: "min-h-[32px] px-3 text-sm",
  md: "min-h-[44px] px-4",
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const cls = [
    "inline-flex items-center justify-center gap-2 rounded-v2-md",
    "font-[family-name:var(--font-inter-tight)]",
    "transition-[background-color,color,border-color,filter] duration-[var(--dur-fast)]",
    "[transition-timing-function:var(--ease-out)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow focus-visible:ring-offset-0",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={isDisabled} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-[14px] w-[14px] rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:opacity-60 motion-reduce:[animation:pulse_1.4s_ease-in-out_infinite]"
    />
  );
}
