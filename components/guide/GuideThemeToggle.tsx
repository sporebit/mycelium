"use client";

import { useSyncExternalStore } from "react";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { applyTheme, resolvedTheme } from "@/lib/theme";

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

/**
 * The standalone guide's own theme toggle (design §3.4): writes
 * ui_prefs.theme exactly as the shells' toggle does, drawn in the Field
 * guide's tokens. The page changes at once; the preference saves behind it.
 */
export function GuideThemeToggle() {
  const { setPrefs } = useUiPrefs();
  const showing = useSyncExternalStore(subscribe, resolvedTheme, () => "dark" as const);
  const next = showing === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        void setPrefs({ theme: next });
      }}
      className="fg-btn min-h-[40px] rounded-lg px-3"
      aria-label={next === "light" ? "Switch to light" : "Switch to dark"}
      data-testid="guide-theme"
      data-showing={showing}
    >
      {next === "light" ? "Switch to light" : "Switch to dark"}
    </button>
  );
}
