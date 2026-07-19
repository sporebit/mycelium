"use client";

import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import {
  UI_PREFS_DEFAULTS,
  UI_PREFS_KEY,
  type UiPrefs,
} from "./uiPrefs";

export function useUiPrefs() {
  const { data } = useApi<UiPrefs>(UI_PREFS_KEY);
  const prefs: UiPrefs = { ...UI_PREFS_DEFAULTS, ...(data ?? {}) };

  async function setPrefs(partial: Partial<UiPrefs>): Promise<void> {
    await mutateApi<UiPrefs>(
      UI_PREFS_KEY,
      (current) => ({ ...(current ?? UI_PREFS_DEFAULTS), ...partial }),
      async () => {
        const res = await fetch(UI_PREFS_KEY, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        if (!res.ok) throw new Error(`ui-prefs save failed (${res.status})`);
      },
    );
  }

  return { prefs, setPrefs };
}
