import { describe, expect, it } from "vitest";
import { buildPersonDays, type PersonFactIn, type PersonSceneIn } from "./person";

const K = "kirsty";
const scene = (id: string, day: string, position: number, title: string, place: Partial<Pick<PersonSceneIn, "place_id" | "place_text" | "place_name">> = {}, narrative: string | null = null): PersonSceneIn => ({
  id,
  day,
  position,
  title,
  place_id: place.place_id ?? null,
  place_text: place.place_text ?? null,
  place_name: place.place_name ?? null,
  narrative,
});
const fact = (id: string, day: string, kind: string, text: string, scene_id: string | null = null, subject: string | null = null): PersonFactIn => ({ id, day, scene_id, kind, subject_person_id: subject, text, data: null });

const scenes = [
  scene("s1", "2026-09-13", 0, "Quayside, fish and chips", { place_id: "p-quay", place_text: "quayside", place_name: "Whitby Quayside" }, "Fish and chips on the quayside.\nMore detail."),
  scene("s2", "2026-09-13", 1, "Beach", { place_text: "Whitby beach" }),
  scene("s3", "2026-08-02", 0, "Quayside again", { place_id: "p-quay", place_name: "Whitby Quayside" }),
  scene("s4", "2026-09-20", 0, "Film night", { place_text: "Whitby Beach" }),
  scene("s5", "2026-09-21", 0, "On the phone"),
];
const facts = [
  fact("f1", "2026-09-13", "food", "A bowl of chips and half my cod", "s1", K),
  fact("f2", "2026-09-13", "person_fact", "Reckons restaurant tap water tastes different", "s1", K),
  fact("f3", "2026-09-13", "spend", "I paid, about £30", "s1"),
  fact("f4", "2026-09-13", "milestone", "Soft-launched us with a photo", "s2"),
  fact("f5", "2026-08-02", "drink", "Tap water", "s3", K),
  fact("f6", "2026-07-01", "milestone", "Started her new job", null, K),
  fact("f7", "2026-09-13", "event", "Max ran into the sea", "s2"),
];

describe("buildPersonDays (spec §6 Days tab)", () => {
  const d = buildPersonDays(K, scenes, facts);

  it("timeline is newest day first, scenes in order within a day, one line each", () => {
    expect(d.timeline.map((t) => t.scene_id)).toEqual(["s5", "s4", "s1", "s2", "s3"]);
    expect(d.timeline.find((t) => t.scene_id === "s1")).toMatchObject({ place: "Whitby Quayside", place_id: "p-quay", line: "Fish and chips on the quayside." });
    expect(d.timeline.find((t) => t.scene_id === "s5")).toMatchObject({ place: null, line: null });
  });
  it("facts are the ones about them, newest first, without their milestones", () => {
    expect(d.facts.map((f) => f.id)).toEqual(["f1", "f2", "f5"]);
  });
  it("milestones are theirs or ones from a scene they were in", () => {
    expect(d.milestones.map((f) => f.id)).toEqual(["f4", "f6"]);
  });
  it("places group by linked place, or by the spoken name case-insensitively; most days first, then most recent", () => {
    expect(d.places.map((p) => [p.place, p.days, p.last_day])).toEqual([
      ["Whitby beach", 2, "2026-09-20"],
      ["Whitby Quayside", 2, "2026-09-13"],
    ]);
  });
  it("a place carries the food, drink and spend shared there — not events", () => {
    const quay = d.places.find((p) => p.place_id === "p-quay")!;
    expect(quay.shared.map((f) => f.id).sort()).toEqual(["f1", "f3", "f5"]);
    expect(d.places.find((p) => p.place === "Whitby beach")!.shared).toEqual([]);
  });
  it("two scenes at one place on one day are one day", () => {
    const twice = buildPersonDays(K, [scene("a", "2026-01-01", 0, "Lunch", { place_text: "The pub" }), scene("b", "2026-01-01", 1, "Dinner", { place_text: "the pub" })], []);
    expect(twice.places).toHaveLength(1);
    expect(twice.places[0].days).toBe(1);
  });
  it("nothing in, nothing out", () => {
    expect(buildPersonDays(K, [], [])).toEqual({ timeline: [], facts: [], places: [], milestones: [] });
  });
});
