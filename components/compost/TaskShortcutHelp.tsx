"use client";

import { useEffect } from "react";

const SHORTCUTS: { keys: string[]; description: string; section: string }[] = [
  { section: "List", keys: ["C"], description: "Create new task" },
  { section: "List", keys: ["J"], description: "Move down" },
  { section: "List", keys: ["K"], description: "Move up" },
  { section: "List", keys: ["Enter"], description: "Open selected task" },
  { section: "List", keys: ["E"], description: "Edit title inline" },
  { section: "List", keys: ["X"], description: "Toggle selection" },
  { section: "List", keys: ["Escape"], description: "Close / cancel / clear" },
  { section: "Detail", keys: ["S"], description: "Focus status" },
  { section: "Detail", keys: ["D"], description: "Focus due date" },
  { section: "Detail", keys: ["Escape"], description: "Close pane" },
  { section: "Help", keys: ["?"], description: "Show this list" },
];

export function ShortcutHintBar({ onOpenHelp }: { onOpenHelp: () => void }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center justify-center gap-3 py-2 select-none">
      <Kbd>C</Kbd> new
      <span className="text-ink-2">·</span>
      <Kbd>J</Kbd>/<Kbd>K</Kbd> navigate
      <span className="text-ink-2">·</span>
      <Kbd>X</Kbd> select
      <span className="text-ink-2">·</span>
      <Kbd>Enter</Kbd> open
      <span className="text-ink-2">·</span>
      <button
        type="button"
        onClick={onOpenHelp}
        className="hover:text-ink-4 transition-colors"
      >
        <Kbd>?</Kbd> shortcuts
      </button>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-0.5 rounded-sm bg-ink-2 text-ink-4 font-[family-name:var(--font-mono)] text-[10px]">
      {children}
    </kbd>
  );
}

export function ShortcutHelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = SHORTCUTS.reduce<
    Record<string, { keys: string[]; description: string }[]>
  >((acc, s) => {
    if (!acc[s.section]) acc[s.section] = [];
    acc[s.section].push({ keys: s.keys, description: s.description });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="relative bg-ink-1 border border-ink-2 rounded-lg shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-4 text-base"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {Object.entries(grouped).map(([section, items]) => (
            <section key={section} className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {section}
              </span>
              <ul className="flex flex-col divide-y divide-ink-2/60">
                {items.map((it, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-ink-4">{it.description}</span>
                    <div className="flex gap-1">
                      {it.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
