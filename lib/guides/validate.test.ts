import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StepsDefinition } from "@/lib/tickets/steps";
import { MAX_OWN_MINUTES, validateDefinition } from "./validate";

const ROOT = path.resolve(__dirname, "../..");

function jsonFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

const good = (): StepsDefinition => ({
  format: "field-guide",
  phases: [
    {
      id: "1",
      title: "One",
      steps: [
        {
          id: "1.1",
          title: "Do it",
          actor: "you",
          where: { label: "In the shell", kind: "terminal" },
          blocks: [{ kind: "command", text: "echo hi" }],
          expect_html: "It prints hi.",
          minutes: 2,
        },
        { id: "1.2", title: "Claude's", actor: "claude-code", did_html: "Done." },
      ],
    },
  ],
});

describe("validateDefinition", () => {
  it("accepts a complete Field guide", () => {
    expect(validateDefinition(good())).toEqual({ ok: true, errors: [] });
  });

  it("refuses anything that is not a definition", () => {
    expect(validateDefinition(null).ok).toBe(false);
    expect(validateDefinition({ phases: "no" }).ok).toBe(false);
  });

  it("accepts an old definition with no format, however bare", () => {
    expect(validateDefinition({ phases: [{ id: "1", title: "x", steps: [{ id: "1.1", title: "y", actor: "you" }] }] }).ok).toBe(true);
  });

  it.each([
    ["where", (d: StepsDefinition) => delete d.phases[0].steps[0].where],
    ["a value", (d: StepsDefinition) => delete d.phases[0].steps[0].blocks],
    ["expect_html", (d: StepsDefinition) => delete d.phases[0].steps[0].expect_html],
    ["minutes", (d: StepsDefinition) => delete d.phases[0].steps[0].minutes],
  ])("refuses a Field guide step with no %s", (what, cut) => {
    const d = good();
    cut(d);
    const v = validateDefinition(d);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain(what);
    expect(v.errors[0]).toContain("1.1");
  });

  it("takes value_html in place of a block", () => {
    const d = good();
    delete d.phases[0].steps[0].blocks;
    d.phases[0].steps[0].value_html = "<code>3111</code>";
    expect(validateDefinition(d).ok).toBe(true);
  });

  it("holds a step with no actor to the rule in a Field guide", () => {
    const d = good();
    d.phases[0].steps.push({ id: "1.3", title: "No actor" });
    expect(validateDefinition(d).ok).toBe(false);
  });

  it("does not hold Claude's steps to the rule", () => {
    const d = good();
    d.phases[0].steps.push({ id: "1.3", title: "Claude only", actor: "claude-code" });
    expect(validateDefinition(d).ok).toBe(true);
  });

  it(`refuses a sitting with more than ${MAX_OWN_MINUTES} minutes of your own steps`, () => {
    const d = good();
    d.phases[0].steps[0].minutes = MAX_OWN_MINUTES + 1;
    const v = validateDefinition(d);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/Phase 1/);
    d.phases[0].steps[0].minutes = MAX_OWN_MINUTES;
    expect(validateDefinition(d).ok).toBe(true);
  });
});

describe("every definition in the repo", () => {
  const files = [...jsonFiles("docs/guides"), ...jsonFiles("docs/checklists")];

  it("finds the example and the old checklists", () => {
    expect(files).toContain(path.join("docs/guides", "example-field-guide.json"));
    expect(files).toContain(path.join("docs/checklists", "rotate-secrets.json"));
  });

  it.each(files)("%s passes", (file) => {
    const def = JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as unknown;
    const v = validateDefinition(def);
    expect(v.errors).toEqual([]);
  });

  it("the example is a Field guide with an irreversible step, troubleshooting and tested marks", () => {
    const def = JSON.parse(readFileSync(path.join(ROOT, "docs/guides/example-field-guide.json"), "utf8")) as StepsDefinition;
    expect(def.format).toBe("field-guide");
    const steps = def.phases.flatMap((p) => p.steps);
    expect(steps.some((s) => s.irreversible)).toBe(true);
    expect(steps.some((s) => (s.troubleshooting?.length ?? 0) > 0)).toBe(true);
    expect(Object.keys(def.tested ?? {}).length).toBeGreaterThan(0);
    const text = JSON.stringify(def);
    expect(text).not.toMatch(/—/);
  });
});
