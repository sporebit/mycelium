import { describe, expect, it } from "vitest";
import { SECTIONS, activeSubPageHref, sectionForPath } from "./sections";

const other = SECTIONS.find((s) => s.key === "other")!;

describe("the sidebar's sections", () => {
  it("every settings page is in the Other section, so its group auto-expands", () => {
    for (const path of ["/other/settings", "/other/settings/security", "/other/settings/people", "/other/settings/teams"]) {
      expect(sectionForPath(path)?.key, path).toBe("other");
    }
  });

  it("lights the sub-page the path is on, and only that one", () => {
    expect(activeSubPageHref("/other/settings", other.subPages)).toBe("/other/settings");
    expect(activeSubPageHref("/other/settings/security", other.subPages)).toBe("/other/settings/security");
    expect(activeSubPageHref("/other/settings/people", other.subPages)).toBe("/other/settings/people");
    expect(activeSubPageHref("/other/settings/teams", other.subPages)).toBe("/other/settings/teams");
    expect(activeSubPageHref("/fitness", other.subPages)).toBeNull();
  });

  it("a query string does not change which sub-page is lit", () => {
    // usePathname() never carries the query; the tab within a page is the page's own business.
    expect(activeSubPageHref("/other/settings/security", other.subPages)).toBe("/other/settings/security");
  });
});
