import type { ComponentPropsWithoutRef } from "react";

export function Mono({
  className = "",
  ...rest
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={`font-[family-name:var(--font-mono)] tabular-nums ${className}`}
      {...rest}
    />
  );
}
