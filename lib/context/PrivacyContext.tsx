"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type PrivacyState = {
  financeHidden: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
};

const PrivacyCtx = createContext<PrivacyState | null>(null);

export function usePrivacy(): PrivacyState {
  const ctx = useContext(PrivacyCtx);
  if (!ctx) {
    return { financeHidden: true, toggle: () => {}, setHidden: () => {} };
  }
  return ctx;
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [financeHidden, setFinanceHidden] = useState(true);

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
