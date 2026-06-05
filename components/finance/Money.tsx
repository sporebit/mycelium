"use client";

import type { ReactNode } from "react";
import { usePrivacy } from "@/lib/context/PrivacyContext";

type MoneyFormat = "currency" | "signed" | "percent" | "pence" | "amount" | "balance";

const REDACTED: Record<MoneyFormat, string> = {
  currency: "£•••••",
  signed: "•£••••",
  percent: "••.••%",
  pence: "•••.•p",
  amount: "•£•••.••",
  balance: "£•••.••",
};

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
      const abs = Math.abs(value).toFixed(2);
      return value >= 0 ? `+£${abs}` : `-£${abs}`;
    }
    case "balance":
      return `£${Number(value).toFixed(2)}`;
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
        {REDACTED[format]}
      </span>
    );
  }

  return <>{fmt(value, format, currency, decimals)}</>;
}
