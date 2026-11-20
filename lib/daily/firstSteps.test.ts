import { describe, expect, it } from "vitest";
import { firstStepPrompt, FIRST_STEP_SYSTEM, MAX_STEP_CHARS, parseFirstSteps } from "./firstSteps";

const ids = ["a1", "b2", "c3"];
/** Entries are marked sure unless the test says otherwise. */
const answer = (steps: Array<{ id: unknown; step: unknown; sure?: unknown }>) => JSON.stringify({ steps: steps.map((s) => ({ sure: true, ...s })) });

describe("first steps from the PC's model", () => {
  it("keeps a good step and gives it a full stop", () => {
    const out = parseFirstSteps(answer([{ id: "a1", step: "When the kettle is on, find the boiler quote email" }]), ids);
    expect(out.get("a1")).toBe("When the kettle is on, find the boiler quote email.");
  });

  it("drops a step for a ticket that was not asked about, and a second one for the same ticket", () => {
    const out = parseFirstSteps(
      answer([
        { id: "zz", step: "Open the drawer and find the passport." },
        { id: "a1", step: "Open the drawer and find the passport." },
        { id: "a1", step: "Ring the plumber on the number in the email." },
      ]),
      ids,
    );
    expect([...out.keys()]).toEqual(["a1"]);
    expect(out.get("a1")).toBe("Open the drawer and find the passport.");
  });

  it("drops thinking words: they are not a first physical action", () => {
    const out = parseFirstSteps(
      answer([
        { id: "a1", step: "Think about which boiler quote is best." },
        { id: "b2", step: "Research boiler prices online tonight." },
        { id: "c3", step: "Make a list of what the shed needs." },
      ]),
      ids,
    );
    expect(out.size).toBe(0);
  });

  it("drops anything in the wording table's never-say column", () => {
    const out = parseFirstSteps(
      answer([
        { id: "a1", step: "Don't forget to post the overdue letter today." },
        { id: "b2", step: "You still haven't rung the dentist, ring them." },
      ]),
      ids,
    );
    expect(out.size).toBe(0);
  });

  it("drops what is too short, too long, or not a sentence", () => {
    const out = parseFirstSteps(
      answer([
        { id: "a1", step: "Ring." },
        { id: "b2", step: "x".repeat(MAX_STEP_CHARS + 1) },
        { id: "c3", step: 42 },
      ]),
      ids,
    );
    expect(out.size).toBe(0);
  });

  it("keeps only what the model itself marked sure", () => {
    const out = parseFirstSteps(
      answer([
        { id: "a1", step: "Find the key to the heating system.", sure: false },
        { id: "b2", step: "Open the dentist's booking page and pick a date.", sure: true },
        { id: "c3", step: "Open the first drive to format.", sure: "yes" },
      ]),
      ids,
    );
    expect([...out.keys()]).toEqual(["b2"]);
    expect(parseFirstSteps(JSON.stringify({ steps: [{ id: "a1", step: "Open the loft hatch and put on gloves." }] }), ids).size, "no flag is not sure").toBe(0);
  });

  it("strips quotation marks and stray space", () => {
    expect(parseFirstSteps(answer([{ id: "b2", step: '  "Put the form   on the desk by the keyboard."  ' }]), ids).get("b2")).toBe("Put the form on the desk by the keyboard.");
  });

  it("finds the JSON when the model wraps it in words, and gives nothing for rubbish", () => {
    const wrapped = `Here you go:\n${answer([{ id: "c3", step: "Open the tax return and fill in the first box." }])}\nHope that helps.`;
    expect(parseFirstSteps(wrapped, ids).get("c3")).toBe("Open the tax return and fill in the first box.");
    expect(parseFirstSteps("no json here", ids).size).toBe(0);
    expect(parseFirstSteps('{"steps":"nope"}', ids).size).toBe(0);
    expect(parseFirstSteps("", ids).size).toBe(0);
  });

  it("the prompt lists each task by its own id, with notes cut short and markup-free text only", () => {
    const p = firstStepPrompt([
      { id: "a1", title: "  Boiler   quote ", notes: "Three emails came in.\nThe British Gas one is cheapest." },
      { id: "b2", title: "Passport" },
    ]);
    expect(p).toBe("id: a1\ntask: Boiler quote\nnotes: Three emails came in. The British Gas one is cheapest.\n\nid: b2\ntask: Passport");
  });

  it("the instructions ask for JSON, British English and no reproach", () => {
    expect(FIRST_STEP_SYSTEM).toContain('{"steps":[');
    expect(FIRST_STEP_SYSTEM).toContain("British English");
    expect(FIRST_STEP_SYSTEM).toContain("Never a reproach");
    expect(FIRST_STEP_SYSTEM).toContain('"sure":true');
  });
});
