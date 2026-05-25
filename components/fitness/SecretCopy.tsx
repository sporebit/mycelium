"use client";

import { useState } from "react";

/**
 * Server-rendered secret with a client-side copy button. The value is sent
 * down once in the HTML — auth-gated by the middleware — and lives only on
 * the page DOM. Never embedded in the bundle.
 */
export function SecretCopy({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select+copy by hand */
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-ink-2 bg-ink-0/40 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
        {label}
      </span>
      <code className="flex-1 min-w-0 text-xs text-ink-4 font-[family-name:var(--font-mono)] truncate select-all">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] px-2 py-1 rounded-md border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 shrink-0"
      >
        {copied ? "✓ COPIED" : "COPY"}
      </button>
    </div>
  );
}
