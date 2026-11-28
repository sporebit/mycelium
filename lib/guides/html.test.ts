import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StepsDefinition, StepsState } from "@/lib/tickets/steps";
import { guideFilename, renderGuideHtml } from "./html";

const ROOT = path.resolve(__dirname, "../..");
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as StepsDefinition;
const now = new Date("2026-11-28T10:00:00Z");

describe("renderGuideHtml", () => {
  const def = load("docs/guides/example-field-guide.json");
  const state: StepsState = {
    toggles: { shell: "bash" },
    steps: { "1.1": { done: true, at: "2026-11-28T09:00:00Z" } },
    answers: { result: "1 passed (12.4s)", port: "sk-ant-api03-abcdefghijklmnopqrstu" },
    failures: { "1.2": { at: "2026-11-28T09:05:00Z", note: "port taken" } },
  };
  const out = renderGuideHtml(def, state, { key: "MYC-999", title: "Fallback", now });

  it("is a whole document with no script and no external font", () => {
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/fonts\.googleapis|@import|<link/i);
    expect(out).toContain("<style>");
    expect(out).toContain("light-dark(");
  });

  it("drops an answer that looks like a secret and keeps the rest", () => {
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("1 passed (12.4s)");
  });

  it("shows ticks, the failure, the irreversible step and the chosen shell", () => {
    expect(out).toContain('aria-label="done"');
    expect(out).toContain("This did not work at 09:05: port taken");
    expect(out).toContain("Cannot be undone");
    expect(out).toContain("rm -rf e2e/.results");
    expect(out).not.toContain("Remove-Item");
    expect(out).toContain("Start the local stack and run one e2e spec");
    expect(out).toContain("Last verified 28 Nov 2026");
  });

  it("uses no em dash", () => {
    expect(out).not.toMatch(/—/);
  });

  it("renders an old definition with no Field guide fields", () => {
    const old = load("docs/checklists/rotate-secrets.json");
    const html = renderGuideHtml(old, { toggles: {}, steps: {}, answers: {} }, { key: "MYC-1", title: "Old", now });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("No check written for this step");
  });

  it("escapes text and strips scripts from authored html", () => {
    const evil: StepsDefinition = {
      title: "<img src=x onerror=alert(1)>",
      phases: [{ id: "1", title: "P", steps: [{ id: "1.1", title: "S", body_html: "<script>alert(1)</script><b>ok</b>" }] }],
    };
    const html = renderGuideHtml(evil, { toggles: {}, steps: {}, answers: {} }, { key: "K-1", title: "x", now });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<img");
    expect(html).toContain("<b>ok</b>");
  });
});

describe("guideFilename", () => {
  it("is key and slug", () => {
    expect(guideFilename("MYC-12", { slug: "local-stack-one-spec", phases: [] })).toBe("MYC-12-local-stack-one-spec.html");
    expect(guideFilename("MYC-12", { title: "Rotate the secrets!", phases: [] })).toBe("MYC-12-rotate-the-secrets.html");
    expect(guideFilename("MYC-12", { phases: [] })).toBe("MYC-12-guide.html");
  });
});
