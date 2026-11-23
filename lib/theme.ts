/**
 * Light and dark (Settings → Appearance → Theme).
 *
 * The preference is ui_prefs.theme, server-rendered as data-theme on <html>
 * in app/layout.tsx so the first paint is already the right one. The colours
 * themselves live in app/globals.css as light-dark() pairs; the attribute
 * only moves color-scheme, and every token follows. These helpers are for
 * the two places CSS cannot reach: the canvases (MyceliumField, the plate's
 * Network) and the theme-color meta tag.
 */
export type Theme = "dark" | "light" | "system";

export const THEMES: readonly Theme[] = ["dark", "light", "system"] as const;

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light" || v === "system";
}

/** The browser chrome colour (theme-color) for each resolved theme: surface-1 on both sides. */
export const THEME_COLOUR = { dark: "#0e1410", light: "#ecebe2" } as const;

/** The ink the canvases draw with, as an "r,g,b" triple for rgba(). Bone on dark, loam on light. */
export const CANVAS_INK = { dark: "232,230,221", light: "27,31,26" } as const;
/** The glow the canvases draw with. Mint on dark, moss on light. */
export const CANVAS_GLOW = { dark: "132,245,184", light: "31,138,85" } as const;

/** What the page is showing right now: the attribute, with "system" resolved through the OS setting. */
export function resolvedTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  if (t === "light") return "light";
  if (t === "dark") return "dark";
  if (t === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

/** Moves the page to a theme at once, without a reload; the meta tag follows so the browser chrome matches. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  const colour = THEME_COLOUR[resolvedTheme()];
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (!m.media) m.content = colour;
  }
}
