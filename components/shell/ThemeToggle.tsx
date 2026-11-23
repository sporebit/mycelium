"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { applyTheme, resolvedTheme } from "@/lib/theme";

/** What the page is showing, read from data-theme on <html> and the OS setting; follows both as they change. */
function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}
function useShowing(): "dark" | "light" {
  // The server has no document: it says dark, and the client corrects on hydration.
  return useSyncExternalStore(subscribe, resolvedTheme, () => "dark");
}

/**
 * The sun / moon in the shells: one press flips light and dark. A person on
 * "system" flips to the opposite of what the OS is showing and stays there;
 * Settings → Appearance → Theme has all three. The page changes at once
 * (data-theme on <html>) and the preference saves behind it.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { setPrefs } = useUiPrefs();
  const showing = useShowing();
  const next = showing === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        void setPrefs({ theme: next });
      }}
      title={next === "light" ? "Light mode" : "Dark mode"}
      aria-label={next === "light" ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle"
      data-showing={showing}
      className={`inline-flex items-center justify-center h-9 w-9 rounded-v2-md text-text-mid hover:text-text-hi hover:bg-surface-2 transition-colors ${className}`}
    >
      {showing === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
    </button>
  );
}
