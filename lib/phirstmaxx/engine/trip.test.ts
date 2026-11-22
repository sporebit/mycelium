import { describe, expect, it } from "vitest";
import { validateTrip, type TripItinerary } from "./trip";

const home = { lat: 54.52, lng: -1.55 };
const itin = (days: TripItinerary["days"]): TripItinerary => ({ days });
const base = { startOn: "2026-09-05", endOn: "2026-09-06", budgetPence: 25_000, home };

describe("validateTrip", () => {
  it("passes a sensible weekend", () => {
    const r = validateTrip({
      ...base,
      constraints: { pet: true, faith: true, max_drive_min: 180 },
      itinerary: itin([
        {
          date: "2026-09-05",
          items: [
            { start: "10:00", end: "13:00", title: "Runswick Bay beach", cost_pence: 0, dog_ok: true, lat: 54.53, lng: -0.74 },
            { start: "13:30", end: "15:00", title: "Crab sandwiches", cost_pence: 2400, dog_ok: true, lat: 54.53, lng: -0.74 },
          ],
        },
        {
          date: "2026-09-06",
          items: [
            { start: "09:30", end: "10:30", title: "Morning service, St Hilda's", cost_pence: 0, dog_ok: true, lat: 54.49, lng: -0.61 },
            { start: "12:00", end: "14:00", title: "Whitby lunch", cost_pence: 3600, dog_ok: true, lat: 54.486, lng: -0.614 },
          ],
        },
      ]),
    });
    expect(r.violations.filter((x) => x.level === "error")).toEqual([]);
    expect(r.costPence).toBe(6000);
    expect(r.driveMinutes).toBeGreaterThan(60);
  });

  it("flags budget, edges, dogs and overlaps", () => {
    const r = validateTrip({
      ...base,
      budgetPence: 5000,
      constraints: { pet: true, leave_after: "2026-09-05T17:00", back_by: "2026-09-06T17:00" },
      itinerary: itin([
        {
          date: "2026-09-05",
          items: [
            { start: "10:00", end: "13:00", title: "Early start", cost_pence: 0, dog_ok: true },
            { start: "12:00", end: "14:00", title: "Overlapping lunch", cost_pence: 8000, dog_ok: false },
          ],
        },
        { date: "2026-09-06", items: [{ start: "16:00", end: "19:00", title: "Late finish", cost_pence: 0, dog_ok: null }] },
      ]),
    });
    const msgs = r.violations.map((x) => x.message);
    expect(msgs.some((m) => m.includes("can't leave until 17:00"))).toBe(true);
    expect(msgs.some((m) => m.includes("back by 17:00"))).toBe(true);
    expect(msgs.some((m) => m.includes("budget"))).toBe(true);
    expect(msgs.some((m) => m.includes("isn't dog-friendly"))).toBe(true);
    expect(msgs.some((m) => m.includes("Not sure whether"))).toBe(true);
    expect(msgs.some((m) => m.includes("overlap"))).toBe(true);
  });

  it("warns about a Sunday with no service when faith is on", () => {
    const r = validateTrip({
      ...base,
      constraints: { faith: true },
      itinerary: itin([{ date: "2026-09-06", items: [{ start: "10:00", end: "12:00", title: "Beach", cost_pence: 0 }] }]),
    });
    expect(r.violations.some((x) => x.message.includes("no service"))).toBe(true);
  });

  it("rejects days outside the range", () => {
    const r = validateTrip({ ...base, constraints: {}, itinerary: itin([{ date: "2026-09-07", items: [] }]) });
    expect(r.violations.some((x) => x.message.includes("outside"))).toBe(true);
  });

  it("warns on a day with too much driving", () => {
    const r = validateTrip({
      ...base,
      constraints: { max_drive_min: 60 },
      itinerary: itin([{ date: "2026-09-05", items: [{ start: "09:00", end: "10:00", title: "Far away", cost_pence: 0, lat: 55.9, lng: -3.2 }] }]),
    });
    expect(r.violations.some((x) => x.message.includes("driving"))).toBe(true);
  });

  it("names the dog when told, and says 'the dog' when not (new with the port)", () => {
    const run = (petName?: string) =>
      validateTrip({
        ...base,
        petName,
        constraints: { pet: true },
        itinerary: itin([{ date: "2026-09-05", items: [{ start: "10:00", end: "11:00", title: "Museum", cost_pence: 0, dog_ok: false }] }]),
      }).violations[0]?.message;
    expect(run("Max")).toBe("Museum isn't dog-friendly and Max is coming.");
    expect(run()).toBe("Museum isn't dog-friendly and the dog is coming.");
  });
});
