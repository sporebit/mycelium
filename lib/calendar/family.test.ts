import { describe, expect, it } from "vitest";
import { FAMILY_CALENDAR, familyEvents } from "./family";

describe("the family's appointments on the calendar", () => {
  const start = new Date("2026-11-01T00:00:00Z");
  const end = new Date("2026-12-31T00:00:00Z");

  it("marks each one as the family's, an hour long, with the place, inside the window, soonest first", () => {
    const out = familyEvents(
      [
        { id: "b", title: "Scan", starts_at: "2026-12-02T09:30:00Z", place: "Hospital", body: null },
        { id: "a", title: "Midwife", starts_at: "2026-11-21T14:00:00Z", place: null, body: "Bring the notes." },
        { id: "gone", title: "Last month", starts_at: "2026-10-21T14:00:00Z", place: null, body: null },
        { id: "far", title: "Next year", starts_at: "2027-01-21T14:00:00Z", place: null, body: null },
        { id: "odd", title: "No time", starts_at: "sometime", place: null, body: null },
      ],
      start,
      end,
    );
    expect(out.map((e) => e.id)).toEqual(["family-a", "family-b"]);
    expect(out[0]).toMatchObject({ title: "Midwife", start: "2026-11-21T14:00:00.000Z", end: "2026-11-21T15:00:00.000Z", allDay: false, calendarName: "Family", calendarColour: FAMILY_CALENDAR.colour, location: "", description: "Bring the notes." });
    expect(out[1]).toMatchObject({ location: "Hospital", description: "" });
  });

  it("is empty for nothing", () => {
    expect(familyEvents([], start, end)).toEqual([]);
  });
});
