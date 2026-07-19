import type { SupabaseClient } from "@supabase/supabase-js";

export type UiPrefs = {
  motion: "full" | "reduced" | "off";
  density: "comfortable" | "compact";
  pinned_mobile_tabs: string[];
  hidden_sections: string[];
  tickers_expanded: boolean;
};

export const UI_PREFS_DEFAULTS: UiPrefs = {
  motion: "full",
  density: "comfortable",
  pinned_mobile_tabs: ["dashboard", "organisation", "fitness", "health"],
  hidden_sections: [],
  tickers_expanded: false,
};

/**
 * Reads ui_prefs from user_settings, defaults-merged so missing keys can
 * never break a caller. Safe to call from server components.
 */
export async function getUiPrefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<UiPrefs> {
  const { data } = await supabase
    .from("user_settings")
    .select("ui_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  const stored = (data?.ui_prefs ?? {}) as Partial<UiPrefs>;
  return { ...UI_PREFS_DEFAULTS, ...stored };
}

export const UI_PREFS_KEY = "/api/settings/ui-prefs";
