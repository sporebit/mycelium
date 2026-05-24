"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "miles-finance-hidden";

export type PrivacyState = {
  financeHidden: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
};

const PrivacyCtx = createContext<PrivacyState | null>(null);

export function usePrivacy(): PrivacyState {
  const ctx = useContext(PrivacyCtx);
  if (!ctx) {
    // Safe default for tests / pages rendered outside the provider tree.
    return { financeHidden: false, toggle: () => {}, setHidden: () => {} };
  }
  return ctx;
}

function readStoredHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [financeHidden, setFinanceHidden] = useState<boolean>(() =>
    readStoredHidden()
  );

  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        financeHidden ? "true" : "false"
      );
    } catch {
      /* quota / privacy mode — silently ignore */
    }
  }, [financeHidden]);

  // Cmd/Ctrl+Shift+H toggles. Skipped when an input/textarea is focused so
  // typing capital-H mid-sentence with modifiers doesn't accidentally fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "h") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setFinanceHidden((cur) => !cur);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => setFinanceHidden((cur) => !cur), []);
  const setHidden = useCallback((v: boolean) => setFinanceHidden(v), []);

  return (
    <PrivacyCtx.Provider value={{ financeHidden, toggle, setHidden }}>
      {children}
    </PrivacyCtx.Provider>
  );
}
