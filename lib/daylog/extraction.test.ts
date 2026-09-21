import { describe, expect, it } from "vitest";
import { emptyExtraction, factsSoFar, mergePatch, namesIn, normaliseExtraction, parseQuickTemplate, pendingItems, quickExtraction, sceneLines, withoutKnown, type ExtractionPatch } from "./extraction";

describe("mergePatch (spec §8)", () => {
  it("upserts a scene by ref and unions its people", () => {
    let ex = mergePatch(emptyExtraction(), { scenes: [{ ref: "quayside", title: "Quayside", people: ["Kirsty"] }] });
    ex = mergePatch(ex, { scenes: [{ ref: "quayside", title: "Quayside, fish and chips", place_text: "Quayside", people: ["kirsty", "Max"] }] });
    expect(ex.scenes).toHaveLength(1);
    expect(ex.scenes[0]).toMatchObject({ title: "Quayside, fish and chips", place_text: "Quayside", people: ["Kirsty", "Max"] });
  });
  it("a patch without a value never blanks an existing field", () => {
    let ex = mergePatch(emptyExtraction(), { scenes: [{ ref: "pod", title: "Pod", place_text: "Staintondale", time_hint: "evening" }] });
    ex = mergePatch(ex, { scenes: [{ ref: "pod", title: "Glamping pod" }] });
    expect(ex.scenes[0]).toMatchObject({ title: "Glamping pod", place_text: "Staintondale", time_hint: "evening" });
  });
  it("derives a ref from the title when the model omits one", () => {
    const ex = mergePatch(emptyExtraction(), { scenes: [{ title: "The Beach!" }] });
    expect(ex.scenes[0].ref).toBe("the-beach");
  });
  it("dedupes facts on normalised text and subject", () => {
    let ex = mergePatch(emptyExtraction(), { scenes: [{ ref: "a", title: "A" }], facts: [{ scene_ref: "a", kind: "spend", text: "About £30, I paid" }] });
    ex = mergePatch(ex, { facts: [{ scene_ref: "a", kind: "spend", text: "about £30 — I paid." }, { kind: "drink", subject: "Kirsty", text: "Tap water" }] });
    expect(ex.facts).toHaveLength(2);
  });
  it("coerces an unknown kind to other and an unknown scene_ref to null", () => {
    const ex = mergePatch(emptyExtraction(), { facts: [{ scene_ref: "nope", kind: "weather" as never, text: "It was dry" }] });
    expect(ex.facts[0]).toMatchObject({ kind: "other", scene_ref: null, confidence: "stated" });
  });
  it("never lists the narrator as a person or a subject", () => {
    const ex = mergePatch(emptyExtraction(), { scenes: [{ ref: "a", title: "A", people: ["me", "Phil", "Kirsty"] }], facts: [{ kind: "food", subject: "I", text: "Cod and chips" }] });
    expect(ex.scenes[0].people).toEqual(["Kirsty"]);
    expect(ex.facts[0].subject).toBeNull();
  });
  it("an answered name leaves unknown_names and stays out", () => {
    let ex = mergePatch(emptyExtraction(), { unknown_names: ["Max"] });
    expect(ex.unknown_names).toEqual(["Max"]);
    ex = mergePatch(ex, { name_answers: { max: "Kirsty's dog" } });
    expect(ex.unknown_names).toEqual([]);
    ex = mergePatch(ex, { unknown_names: ["Max"] });
    expect(ex.unknown_names).toEqual([]);
  });
  it("does not mutate its input", () => {
    const ex = mergePatch(emptyExtraction(), { scenes: [{ ref: "a", title: "A", people: ["Kirsty"] }] });
    const snapshot = JSON.stringify(ex);
    mergePatch(ex, { scenes: [{ ref: "a", title: "B", people: ["Max"] }], facts: [{ kind: "other", text: "x" }] });
    expect(JSON.stringify(ex)).toBe(snapshot);
  });
  it("normaliseExtraction survives junk and keeps scene_ids", () => {
    expect(normaliseExtraction(null)).toEqual(emptyExtraction());
    expect(normaliseExtraction({ scenes: "no", facts: [null, { text: "" }] })).toEqual(emptyExtraction());
    expect(normaliseExtraction({ scenes: [{ ref: "a", title: "A" }], scene_ids: { a: "uuid" } }).scene_ids).toEqual({ a: "uuid" });
  });
  it("withoutKnown drops names the people table already has", () => {
    const ex = mergePatch(emptyExtraction(), { unknown_names: ["Kirsty", "Max"] });
    expect(withoutKnown(ex, ["kirsty"]).unknown_names).toEqual(["Max"]);
  });
});

describe("Quick-mode template parse (spec §8)", () => {
  it("who / where / one line", () => {
    expect(parseQuickTemplate("Kirsty and Max / Whitby / fish and chips then the beach")).toEqual({ who: ["Kirsty", "Max"], where: "Whitby", line: "fish and chips then the beach" });
  });
  it("new lines work as separators and extra slashes stay in the line", () => {
    expect(parseQuickTemplate("Tom, Sam\nthe pub\nquiz night / came second")).toEqual({ who: ["Tom", "Sam"], where: "the pub", line: "quiz night / came second" });
  });
  it("alone and no place", () => {
    expect(parseQuickTemplate("no one / - / worked all day")).toEqual({ who: [], where: null, line: "worked all day" });
  });
  it("a reply that ignores the template is the line", () => {
    expect(parseQuickTemplate("Just a quiet one at home")).toEqual({ who: [], where: null, line: "Just a quiet one at home" });
  });
  it("becomes a single scene", () => {
    const ex = quickExtraction("Kirsty / Whitby / chips");
    expect(ex.scenes).toEqual([{ ref: "day", title: "Whitby", place_text: "Whitby", time_hint: null, people: ["Kirsty"] }]);
  });
});

describe("pending items (spec §4.4 step 3)", () => {
  const ex = mergePatch(emptyExtraction(), {
    scenes: [
      { ref: "quayside", title: "Quayside", place_text: "Quayside", people: ["Kirsty", "Max"] },
      { ref: "beach", title: "Beach", place_text: "Whitby beach", people: ["Kirsty", "Max"] },
    ],
    facts: [{ scene_ref: "quayside", kind: "drink", subject: "Kirsty", text: "Tap water" }],
    name_answers: { Max: "Kirsty's dog" },
  });
  it("a known name is a link across its scenes; an unknown one is a new person carrying the answer", () => {
    const items = pendingItems(ex, new Map([["kirsty", "p1"]]));
    expect(items.find((i) => i.type === "daylog_person_link")).toMatchObject({ name: "Kirsty", person_id: "p1", scene_refs: ["quayside", "beach"] });
    expect(items.find((i) => i.type === "daylog_new_person")).toMatchObject({ name: "Max", note: "Kirsty's dog", scene_refs: ["quayside", "beach"] });
  });
  it("places already linked are not queued; the rest are, once each", () => {
    const items = pendingItems(ex, new Map(), new Set(["quayside"]));
    expect(items.filter((i) => i.type === "daylog_place").map((i) => i.name)).toEqual(["Whitby beach"]);
  });
  it("keys are stable, so a re-extract queues nothing twice", () => {
    const a = pendingItems(ex, new Map()).map((i) => i.key);
    const b = pendingItems(mergePatch(ex, { facts: [{ kind: "drink", subject: "Kirsty", text: "tap water." }] }), new Map()).map((i) => i.key);
    expect(b).toEqual(a);
  });
  it("a fact subject who was in no scene still becomes a person to review", () => {
    const e = mergePatch(emptyExtraction(), { facts: [{ kind: "person_fact", subject: "Dave", text: "Has moved to Leeds" }] });
    expect(pendingItems(e, new Map()).map((i) => i.type)).toEqual(["daylog_new_person", "daylog_fact"]);
  });
});

/**
 * Prompt-regression fixture (spec §8, §9): Phil's Whitby night, replayed as
 * the patches a correct extraction returns per turn. This pins the merge,
 * not the model — the model half is checked live on production.
 */
describe("the Whitby night", () => {
  const turns: ExtractionPatch[] = [
    {
      scenes: [
        { ref: "quayside", title: "Quayside, fish and chips", place_text: "Quayside", people: ["Kirsty", "Max"] },
        { ref: "beach", title: "Walk down to the beach", place_text: "Whitby beach", people: ["Kirsty", "Max"] },
        { ref: "arches", title: "Whale arches, missing", place_text: "whale arches", people: ["Kirsty", "Max"] },
        { ref: "pod", title: "Pod in Staintondale", place_text: "Staintondale", people: ["Kirsty", "Max"] },
      ],
      facts: [{ scene_ref: "arches", kind: "event", text: "Tried to see the whale arches but they were missing" }],
      unknown_names: ["Max"],
    },
    { scenes: [], facts: [], name_answers: { Max: "Kirsty's dog" } },
    {
      scenes: [{ ref: "quayside", title: "Quayside, fish and chips" }],
      facts: [
        { scene_ref: "quayside", kind: "food", text: "Cod and chips with mushy peas" },
        { scene_ref: "quayside", kind: "food", subject: "Kirsty", text: "A bowl of chips and half my cod with curry sauce" },
        { scene_ref: "quayside", kind: "person_fact", subject: "Kirsty", text: "Reckons restaurant tap water tastes different" },
      ],
    },
    { scenes: [], facts: [{ scene_ref: "quayside", kind: "spend", text: "I paid, about £30", data: { amount_pence: 3000, who_paid: "me" } }] },
    { scenes: [], facts: [{ scene_ref: "beach", kind: "other", subject: "Max", text: "Had a great time on the beach" }] },
    { scenes: [], facts: [{ scene_ref: "arches", kind: "milestone", text: "Kirsty soft-launched us with a photo from the top of the hill" }] },
    { scenes: [{ ref: "pod", title: "Glamping pod in Staintondale" }], facts: [{ scene_ref: "pod", kind: "place_fact", text: "The pod was decent" }] },
  ];
  const states = turns.reduce<ReturnType<typeof emptyExtraction>[]>((acc, p) => [...acc, mergePatch(acc[acc.length - 1] ?? emptyExtraction(), p)], []);
  const final = states[states.length - 1];

  it("four scenes, in order", () => {
    expect(final.scenes.map((s) => s.ref)).toEqual(["quayside", "beach", "arches", "pod"]);
  });
  it("people are Kirsty and Max", () => {
    expect(namesIn(final).sort()).toEqual(["Kirsty", "Max"]);
  });
  it("Max is unknown on turn 1 and never again after the answer", () => {
    expect(states[0].unknown_names).toEqual(["Max"]);
    for (const s of states.slice(1)) expect(s.unknown_names).toEqual([]);
  });
  it("one milestone", () => {
    expect(final.facts.filter((f) => f.kind === "milestone")).toHaveLength(1);
  });
  it("facts-so-far names what is already answered", () => {
    const block = factsSoFar(final);
    expect(block).toContain('scene "Quayside, fish and chips"');
    expect(block).toContain("spend: I paid, about £30");
    expect(block).toContain("Max is: Kirsty's dog");
  });
  it("with Kirsty known: 1 link, 1 new person, 4 places, 8 facts", () => {
    const counts: Record<string, number> = {};
    for (const i of pendingItems(final, new Map([["kirsty", "p1"]]))) counts[i.type] = (counts[i.type] ?? 0) + 1;
    expect(counts).toEqual({ daylog_person_link: 1, daylog_new_person: 1, daylog_place: 4, daylog_fact: 8 });
  });
});

describe("sceneLines", () => {
  it("reads the bullet lines of the close narrative", () => {
    expect(sceneLines("We went to Whitby.\n\n• Quayside for fish and chips.\n• Down to the beach.")).toEqual(["Quayside for fish and chips.", "Down to the beach."]);
    expect(sceneLines(null)).toEqual([]);
  });
});
