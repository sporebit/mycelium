import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UI_PREFS_DEFAULTS } from "@/lib/settings/uiPrefs";
import { CANVAS_GLOW, CANVAS_INK, THEME_COLOUR, applyTheme, isTheme, resolvedTheme } from "./theme";

describe("theme", () => {
  it("knows the three values and nothing else; dark is the default", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(UI_PREFS_DEFAULTS.theme).toBe("dark");
  });

  it("without a document (the server) it resolves to dark and applying is a no-op", () => {
    expect(resolvedTheme()).toBe("dark");
    expect(() => applyTheme("light")).not.toThrow();
  });

  it("the canvas inks and the chrome colours come in matched pairs", () => {
    for (const pair of [CANVAS_INK, CANVAS_GLOW, THEME_COLOUR]) {
      expect(Object.keys(pair).sort()).toEqual(["dark", "light"]);
      expect(pair.dark).not.toBe(pair.light);
    }
  });

  it("every surface, text, glow and semantic token in globals.css is a light-dark() pair, and data-theme moves color-scheme", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}\n", css.indexOf(":root {")));
    const themed = [
      "--surface-0", "--surface-1", "--surface-2", "--surface-3",
      "--hairline", "--hairline-strong",
      "--text-hi", "--text-mid", "--text-lo", "--text-ghost",
      "--glow", "--glow-dim", "--glow-wash", "--glow-3",
      "--warn", "--warn-bg", "--error", "--error-bg", "--info", "--info-bg", "--good", "--good-bg",
      "--hyphal-stroke",
      "--plate-paper", "--plate-ink", "--plate-soft", "--plate-card", "--plate-shade",
    ];
    for (const name of themed) {
      const m = root.match(new RegExp(`${name}: ([^;]+);`));
      expect(m, name).not.toBeNull();
      expect(m![1].startsWith("light-dark("), `${name} = ${m![1]}`).toBe(true);
    }
    // light-dark(light, dark): the dark side is the palette the app has always had.
    expect(root).toContain("--surface-0: light-dark(#f4f3ec, #0b100d);");
    expect(root).toContain("--text-hi: light-dark(#1b1f1a, #ecebe3);");
    expect(root).toContain("color-scheme: dark;");
    expect(css).toMatch(/\[data-theme="light"\]\s*\{\s*color-scheme: light;/);
    expect(css).toMatch(/\[data-theme="system"\]\s*\{\s*color-scheme: light dark;/);
  });
});
