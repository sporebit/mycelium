"use client";

import { useEffect, useState } from "react";
import { CARD_REGISTRY, type CardLayoutRow } from "@/lib/dashboard/card-registry";

export function DashboardSettings({
  layout,
  onClose,
  onToggleHidden,
  onReset,
}: {
  layout: CardLayoutRow[];
  onClose: () => void;
  onToggleHidden: (card_key: string, hidden: boolean) => void;
  onReset: () => Promise<void> | void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function doReset() {
    setResetting(true);
    try {
      await onReset();
      setConfirmingReset(false);
      onClose();
    } finally {
      setResetting(false);
    }
  }

  // Stable sorted list — visible first (in position order), then hidden.
  const visible = [...layout]
    .filter((r) => !r.hidden && CARD_REGISTRY[r.card_key])
    .sort((a, b) => a.position - b.position);
  const hidden = [...layout]
    .filter((r) => r.hidden && CARD_REGISTRY[r.card_key])
    .sort((a, b) => a.position - b.position);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize dashboard"
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-md bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-lg shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <div>
            <div className="card-eyebrow">Dashboard</div>
            <h2 className="text-lg italic font-[family-name:var(--font-display)] text-text-0">
              Customize
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-2 hover:text-text-0 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          <Section title="Visible">
            {visible.length === 0 ? (
              <p className="text-xs text-text-2 italic font-[family-name:var(--font-display)]">
                Nothing visible.
              </p>
            ) : (
              <ul className="flex flex-col">
                {visible.map((r) => (
                  <Row
                    key={r.card_key}
                    label={CARD_REGISTRY[r.card_key].label}
                    hidden={false}
                    onToggle={() => onToggleHidden(r.card_key, true)}
                  />
                ))}
              </ul>
            )}
          </Section>

          {hidden.length > 0 && (
            <Section title={`Hidden · ${hidden.length}`}>
              <ul className="flex flex-col">
                {hidden.map((r) => (
                  <Row
                    key={r.card_key}
                    label={CARD_REGISTRY[r.card_key].label}
                    hidden
                    onToggle={() => onToggleHidden(r.card_key, false)}
                  />
                ))}
              </ul>
            </Section>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-ink-2 flex items-center gap-2">
          {confirmingReset ? (
            <>
              <span className="flex-1 text-xs text-text-1 italic font-[family-name:var(--font-display)]">
                Reset all cards to defaults?
              </span>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                disabled={resetting}
                className="px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.15em] disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => void doReset()}
                disabled={resetting}
                className="px-3 py-1.5 rounded-sm bg-error/20 border border-error/40 text-error text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-error/30 disabled:opacity-40"
              >
                {resetting ? "RESETTING…" : "RESET"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="ml-auto px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-2 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.15em]"
            >
              RESET TO DEFAULTS
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="card-eyebrow">{title}</div>
      {children}
    </div>
  );
}

function Row({
  label,
  hidden,
  onToggle,
}: {
  label: string;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 border-b border-ink-2 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="text-text-2 text-base shrink-0">
          {hidden ? "👁️‍🗨️" : "👁"}
        </span>
        <span
          className={`text-sm truncate ${hidden ? "text-text-2 line-through" : "text-text-0"}`}
        >
          {label}
        </span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`px-3 py-1 rounded-sm text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] transition-colors ${
          hidden
            ? "bg-glow-2 text-text-0 hover:bg-glow-1"
            : "border border-ink-4 text-text-1 hover:text-text-0 hover:bg-ink-2"
        }`}
      >
        {hidden ? "SHOW" : "HIDE"}
      </button>
    </li>
  );
}
