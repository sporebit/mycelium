"use client";

import { Money } from "@/components/finance/Money";
import { usePrivacy } from "@/lib/context/PrivacyContext";

type NumFormat = "plain" | "currency" | "percent";

// Same visual masking Money uses (dot placeholder, constant width via ch)
// so redacted numerics don't shift the layout when privacy flips.
const PLAIN_REDACTED = "•••••";
const PERCENT_REDACTED = "•••.•%";

function fmtPlain(value: number, decimals: number): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPercent(value: number, decimals: number): string {
  return `${value.toFixed(decimals)}%`;
}

export function Num({
  value,
  format = "plain",
  decimals,
  className = "",
}: {
  value: number;
  format?: NumFormat;
  decimals?: number;
  className?: string;
}) {
  const { financeHidden } = usePrivacy();

  if (format === "currency") {
    return (
      <span
        className={`font-[family-name:var(--font-jetbrains-mono)] tabular-nums ${className}`}
      >
        <Money value={value} format="currency" decimals={decimals ?? 2} />
      </span>
    );
  }

  const isPercent = format === "percent";
  const dec = decimals ?? (isPercent ? 1 : 0);

  if (financeHidden) {
    return (
      <span
        className={`inline-block font-[family-name:var(--font-jetbrains-mono)] tabular-nums select-none text-text-lo ${className}`}
        style={{ minWidth: "6ch" }}
        aria-label="Hidden value"
      >
        {isPercent ? PERCENT_REDACTED : PLAIN_REDACTED}
      </span>
    );
  }

  const rendered = isPercent ? fmtPercent(value, dec) : fmtPlain(value, dec);
  return (
    <span
      className={`font-[family-name:var(--font-jetbrains-mono)] tabular-nums ${className}`}
    >
      {rendered}
    </span>
  );
}
