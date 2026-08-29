"use client";

import type { ReactNode } from "react";
import { usePrivacy } from "@/lib/context/PrivacyContext";

type MoneyFormat = "currency" | "signed" | "percent" | "pence" | "amount" | "balance";

const SYMBOLS: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

/** Falls back to the code itself for a currency with no symbol mapped. */
function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

function redacted(format: MoneyFormat, currency: string): string {
  const sym = symbolFor(currency);
  switch (format) {
    case "currency":
      return `${sym}•••••`;
    case "signed":
      return `•${sym}••••`;
    case "percent":
      return "••.••%";
    case "pence":
      return "•••.•p";
    case "amount":
      return `•${sym}•••.••`;
    case "balance":
      return `${sym}•••.••`;
  }
}

function fmt(value: number, format: MoneyFormat, currency: string, decimals: number): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    case "signed": {
      const abs = Math.abs(value);
      const sign = value >= 0 ? "+" : "−";
      return `${sign}${new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(abs)}`;
    }
    case "percent": {
      const sign = value >= 0 ? "+" : "−";
      return `${sign}${Math.abs(value).toFixed(decimals)}%`;
    }
    case "pence":
      return `${value.toFixed(1)}p`;
    case "amount": {
      const sym = symbolFor(currency);
      const abs = Math.abs(value).toFixed(2);
      return value >= 0 ? `+${sym}${abs}` : `-${sym}${abs}`;
    }
    case "balance":
      return `${symbolFor(currency)}${Number(value).toFixed(2)}`;
  }
}

export function PrivateText({
  children,
  placeholder = "••••••••••",
  className = "",
}: {
  children: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const { financeHidden } = usePrivacy();

  if (financeHidden) {
    return (
      <span
        className={`inline-block select-none text-ink-3 ${className}`}
        aria-label="Hidden text"
      >
        {placeholder}
      </span>
    );
  }

  return <>{children}</>;
}

export function Money({
  value,
  format = "currency",
  currency = "GBP",
  decimals = 2,
}: {
  value: number;
  format?: MoneyFormat;
  currency?: string;
  decimals?: number;
}) {
  const { financeHidden } = usePrivacy();

  if (financeHidden) {
    return (
      <span
        className="inline-block tabular-nums select-none text-ink-3"
        style={{ minWidth: "6ch" }}
        aria-label="Hidden value"
      >
        {redacted(format, currency)}
      </span>
    );
  }

  return <>{fmt(value, format, currency, decimals)}</>;
}

/**
 * String-returning GBP formatter for the places a <Money/> element cannot go —
 * recharts `tickFormatter` and `formatter` callbacks, which must return a
 * string. `hidden` mirrors the privacy state so chart axes redact along with
 * everything else instead of quietly leaking amounts.
 */
export function formatGBP(
  value: number,
  opts?: { decimals?: number; hidden?: boolean },
): string {
  if (opts?.hidden) return "•••";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: opts?.decimals ?? 0,
    maximumFractionDigits: opts?.decimals ?? 0,
  }).format(value);
}
