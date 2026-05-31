"use client";

import { useState } from "react";
import {
  CONVERTIBLE_KINDS,
  KIND_LABELS,
  type ConvertibleKind,
} from "@/lib/convert/kinds";

/**
 * Convert-to-other-kind widget. Lives in the right sidebar of the
 * task detail pane. On confirm, POSTs /api/convert and hands off to
 * `onConverted` with the new record's id + kind.
 */
export function ConvertSection({
  fromKind,
  fromId,
  fromTitle,
  onConverted,
  onError,
}: {
  fromKind: ConvertibleKind;
  fromId: string;
  fromTitle: string;
  onConverted: (newKind: ConvertibleKind, newId: string) => void;
  onError: (msg: string) => void;
}) {
  const [target, setTarget] = useState<ConvertibleKind | "">("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = CONVERTIBLE_KINDS.filter((k) => k !== fromKind);

  async function doConvert() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_kind: fromKind,
          from_id: fromId,
          to_kind: target,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        new_id?: string;
        new_kind?: ConvertibleKind;
        error?: string;
      };
      if (!res.ok || !j.new_id || !j.new_kind) {
        onError(j.error ?? "Convert failed");
        return;
      }
      setConfirming(false);
      setTarget("");
      onConverted(j.new_kind, j.new_id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        Convert
      </span>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value as ConvertibleKind | "")}
        disabled={busy}
        className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
      >
        <option value="">Convert to…</option>
        {options.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {target && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="mt-1 px-2 py-1.5 rounded-md bg-warn/10 border border-warn/40 text-warn hover:bg-warn/20 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40 transition-colors"
        >
          {busy ? "CONVERTING…" : `→ ${KIND_LABELS[target].toUpperCase()}`}
        </button>
      )}

      {confirming && target && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirming(false)}
            className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
          />
          <div
            role="dialog"
            aria-label="Confirm convert"
            className="relative w-full max-w-sm rounded-lg bg-ink-1 border border-ink-2 shadow-2xl p-5 flex flex-col gap-4"
          >
            <h3 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
              Convert this {KIND_LABELS[fromKind].toLowerCase()} to a{" "}
              {KIND_LABELS[target].toLowerCase()}?
            </h3>
            <p className="text-sm text-ink-3">
              <strong className="text-ink-4">{fromTitle}</strong> will be
              soft-deleted and a new {KIND_LABELS[target].toLowerCase()} record
              will be created with its fields where they map. Some fields may
              not transfer.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={doConvert}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-warn/15 border border-warn/40 text-warn hover:bg-warn/25 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
              >
                {busy ? "WORKING…" : "CONVERT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
