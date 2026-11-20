import { describe, expect, it } from "vitest";
import { buildBlockOut, buildBlockOutIcs, fillTemplate, fridayOf } from "./blockout";

const settings = {
  block_out_recipients: ["a@example.com", " b@example.com "],
  block_out_subject_template: "Friday {dd/mm/yyyy} - out of office",
  block_out_body_lines: ["Hi all,", "", "I have met my hours; Friday is clear.", "Phil"],
};

describe("fridayOf", () => {
  it("finds the Friday of the week for any weekday", () => {
    expect(fridayOf("2026-11-16")).toBe("2026-11-20"); // Monday
    expect(fridayOf("2026-11-19")).toBe("2026-11-20"); // Thursday
    expect(fridayOf("2026-11-22")).toBe("2026-11-20"); // Sunday (same Mon–Sun week)
  });
});

describe("fillTemplate", () => {
  it("fills the workbook token and the friendlier ones", () => {
    expect(fillTemplate("{dd/mm/yyyy}", "2026-11-20")).toBe("20/11/2026");
    expect(fillTemplate("{date} and {d Mon}", "2026-11-20")).toBe("20/11/2026 and Fri 20 Nov");
  });
});

describe("buildBlockOut", () => {
  it("builds a mailto with every recipient, the subject and the body", () => {
    const b = buildBlockOut(settings, "2026-11-18");
    expect(b.friday).toBe("2026-11-20");
    expect(b.to).toEqual(["a@example.com", "b@example.com"]);
    expect(b.subject).toBe("Friday 20/11/2026 - out of office");
    expect(b.body).toBe("Hi all,\n\nI have met my hours; Friday is clear.\nPhil");
    expect(b.mailto.startsWith("mailto:a%40example.com,b%40example.com?subject=Friday%2020%2F11%2F2026")).toBe(true);
    expect(b.mailto).toContain("&body=Hi%20all%2C%0A%0AI%20have%20met");
  });
});

describe("buildBlockOutIcs", () => {
  it("is an all-day transparent event on the Friday with escaped text", () => {
    const b = buildBlockOut({ ...settings, block_out_body_lines: ["Line one; with, commas"] }, "2026-11-20");
    const ics = buildBlockOutIcs(b, new Date("2026-11-18T13:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121\r\n");
    expect(ics).toContain("DTSTAMP:20261118T130000Z\r\n");
    expect(ics).toContain("UID:hours-blockout-2026-11-20@mycelium\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\; with\\, commas\r\n");
    expect(ics).toContain("TRANSP:TRANSPARENT\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("folds long lines at 75 characters", () => {
    const b = buildBlockOut({ ...settings, block_out_body_lines: ["x".repeat(200)] }, "2026-11-20");
    const ics = buildBlockOutIcs(b);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});
