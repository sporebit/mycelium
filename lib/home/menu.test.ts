import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/nav/sections";
import { groupForPath, MENU_GROUPS, menuHrefs } from "./menu";

describe("the top menu", () => {
  it("every place in it is a real page", () => {
    for (const href of menuHrefs()) {
      const dir = href === "/" ? "app" : path.join("app", ...href.split("/").filter(Boolean));
      expect(existsSync(path.join(process.cwd(), dir, "page.tsx")), href).toBe(true);
    }
  });

  it("no place appears twice, and no group is empty", () => {
    const all = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
    for (const g of MENU_GROUPS) expect(g.items.length, g.label).toBeGreaterThan(0);
  });

  it("every section of the old sidebar is still reachable: its base page or one of its sub-pages is under a menu place", () => {
    const hrefs = menuHrefs();
    for (const s of SECTIONS) {
      const reachable = [s.baseRoute, ...s.subPages.map((p) => p.href)].some((p) => hrefs.some((h) => h !== "/" && (p === h || p.startsWith(h + "/") || h.startsWith(p + "/"))));
      expect(reachable, s.label).toBe(true);
    }
  });

  it("knows which group a page is in; the more specific place wins", () => {
    expect(groupForPath("/")).toBe("Today");
    expect(groupForPath("/today")).toBe("Today");
    expect(groupForPath("/organisation/hours/log")).toBe("Work");
    expect(groupForPath("/organisation/people")).toBe("Life");
    expect(groupForPath("/organisation/captures/review")).toBe("Review");
    expect(groupForPath("/fitness/body")).toBe("Body");
    expect(groupForPath("/other/settings/security")).toBe("Settings");
    expect(groupForPath("/no/such/place")).toBeNull();
  });
});
