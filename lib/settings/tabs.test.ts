import { describe, expect, it } from "vitest";
import { buildTabs, resolveTab, tabHref } from "./tabs";

const KEYS = ["signin", "sessions", "access", "account"] as const;

describe("settings tabs", () => {
  it("landing with no parameter selects the first tab", () => {
    expect(resolveTab(KEYS, null)).toBe("signin");
    expect(resolveTab(KEYS, undefined)).toBe("signin");
    expect(resolveTab(KEYS, "")).toBe("signin");
  });

  it("a known parameter selects its tab; an unknown one falls back to the first", () => {
    expect(resolveTab(KEYS, "access")).toBe("access");
    expect(resolveTab(KEYS, "nope")).toBe("signin");
  });

  it("the first tab lives at the page itself and the rest at ?tab=", () => {
    expect(tabHref("/other/settings/security", KEYS, "signin")).toBe("/other/settings/security");
    expect(tabHref("/other/settings/security", KEYS, "access")).toBe("/other/settings/security?tab=access");
  });

  it("a tab may be its own route", () => {
    const tabs = buildTabs("/other/settings/people", [
      { key: "people", label: "People" },
      { key: "sharing", label: "Sharing" },
      { key: "teams", label: "Teams", href: "/other/settings/teams" },
    ]);
    expect(tabs.map((t) => t.href)).toEqual([
      "/other/settings/people",
      "/other/settings/people?tab=sharing",
      "/other/settings/teams",
    ]);
  });
});
