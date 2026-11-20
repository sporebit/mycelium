import { describe, expect, it } from "vitest";
import { PAGE_BLURBS, sectionCards } from "./cards";
import { SECTIONS } from "./sections";

describe("the boxes on a section's home page", () => {
  it("every page in the sidebar has a line to show on its box", () => {
    for (const s of SECTIONS) for (const sp of s.subPages) expect(PAGE_BLURBS[sp.href], sp.href).toBeTruthy();
  });

  it("a section's home shows a box for every one of its pages but itself", () => {
    for (const s of SECTIONS) {
      const hrefs = sectionCards(s.key).map((c) => c.href);
      for (const sp of s.subPages) {
        if (sp.href === s.baseRoute) expect(hrefs).not.toContain(sp.href);
        else expect(hrefs, `${s.key} ${sp.href}`).toContain(sp.href);
      }
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("a custom card keeps its key and detail; one outside the sidebar is appended; omit skips", () => {
    const cards = sectionCards("health", {
      custom: [
        { key: "gut_health", label: "Gut Health", href: "/health/gut-health", description: "x", detail: "Type 4" },
        { key: "body", label: "Body Metrics", href: "/fitness/body", description: "y" },
      ],
      omit: ["/health/recipes/gousto"],
    });
    expect(cards.find((c) => c.href === "/health/gut-health")).toMatchObject({ key: "gut_health", detail: "Type 4" });
    expect(cards.at(-1)).toMatchObject({ key: "body", href: "/fitness/body" });
    expect(cards.map((c) => c.href)).not.toContain("/health/recipes/gousto");
    expect(cards.filter((c) => c.key === "body")).toHaveLength(1);
  });

  it("the fitness overview, which is not at the section's base, can include Today", () => {
    expect(sectionCards("fitness", { includeBase: true }).map((c) => c.href)).toContain("/fitness");
  });
});
