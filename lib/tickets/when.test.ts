import { describe, expect, it } from "vitest";
import { addDays, datesForWhen, isDueWithin, isOverdue, monthEnd, todayLondon, weekendsFrom, whenLabel } from "./when";

describe("when — calendar arithmetic (spec §18 R4)", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-23", 7)).toBe("2026-09-30");
    expect(addDays("2026-09-25", 7)).toBe("2026-10-02");
    expect(addDays("2026-12-30", 30)).toBe("2027-01-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the month end, including February and leap years", () => {
    expect(monthEnd("2026-09-23")).toBe("2026-09-30");
    expect(monthEnd("2026-02-15")).toBe("2026-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(monthEnd("2026-01-31")).toBe("2026-01-31");
    expect(monthEnd("2026-12-01")).toBe("2026-12-31");
  });

  it("gives London dates, not UTC, either side of a BST midnight", () => {
    expect(todayLondon(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(todayLondon(new Date("2026-01-31T23:30:00Z"))).toBe("2026-01-31");
  });
});

describe("when — the choices write dates", () => {
  const today = "2026-09-23"; // a Wednesday
  it("week / month / end of month set a deadline only", () => {
    expect(datesForWhen({ window: "week" }, today)).toEqual({ due_window: "week", deadline_on: "2026-09-30", scheduled_on: null, someday: false });
    expect(datesForWhen({ window: "month" }, today)).toEqual({ due_window: "month", deadline_on: "2026-10-23", scheduled_on: null, someday: false });
    expect(datesForWhen({ window: "month_end" }, today)).toEqual({ due_window: "month_end", deadline_on: "2026-09-30", scheduled_on: null, someday: false });
  });
  it("a weekend schedules Saturday and deadlines Sunday", () => {
    expect(datesForWhen({ window: "weekend", saturday: "2026-09-26" }, today)).toEqual({ due_window: "weekend", scheduled_on: "2026-09-26", deadline_on: "2026-09-27", someday: false });
  });
  it("someday parks it with no dates; a picked date is a deadline", () => {
    expect(datesForWhen({ window: "someday" }, today)).toEqual({ due_window: "someday", deadline_on: null, scheduled_on: null, someday: true });
    expect(datesForWhen({ window: "date", date: "2026-11-05" }, today)).toEqual({ due_window: "date", deadline_on: "2026-11-05", scheduled_on: null, someday: false });
  });
});

describe("when — the next eight weekends", () => {
  it("from a Wednesday the first is the coming Saturday", () => {
    const w = weekendsFrom("2026-09-23");
    expect(w).toHaveLength(8);
    expect(w[0]).toMatchObject({ saturday: "2026-09-26", sunday: "2026-09-27", label: "This coming weekend" });
    expect(w[1]).toMatchObject({ saturday: "2026-10-03", sunday: "2026-10-04", label: "Sat 3–4 Oct" });
    expect(w[7].saturday).toBe("2026-11-14");
  });
  it("on a Saturday the first is today; on a Sunday it is yesterday's Saturday", () => {
    expect(weekendsFrom("2026-09-26")[0]).toMatchObject({ saturday: "2026-09-26", sunday: "2026-09-27", label: "This weekend" });
    expect(weekendsFrom("2026-09-27")[0]).toMatchObject({ saturday: "2026-09-26", sunday: "2026-09-27", label: "This weekend" });
    expect(weekendsFrom("2026-09-27")[1].saturday).toBe("2026-10-03");
  });
  it("labels a weekend that straddles a month", () => {
    expect(weekendsFrom("2026-10-19")[1].label).toBe("Sat 31 Oct – 1 Nov");
  });
});

describe("when — overdue is a flag (R5)", () => {
  const today = "2026-09-23";
  it("a past deadline on an open ticket is overdue; today is not", () => {
    expect(isOverdue({ deadline_on: "2026-09-22", category: "next" }, today)).toBe(true);
    expect(isOverdue({ deadline_on: "2026-09-23", category: "next" }, today)).toBe(false);
    expect(isOverdue({ due_date: "2026-09-01", category: "doing" }, today)).toBe(true);
  });
  it("done and cancelled are never overdue, nor is an undated ticket", () => {
    expect(isOverdue({ deadline_on: "2026-09-01", category: "done" }, today)).toBe(false);
    expect(isOverdue({ deadline_on: "2026-09-01", category: "cancelled" }, today)).toBe(false);
    expect(isOverdue({ deadline_on: "2026-09-01", category: "next", completed_at: "2026-09-02T00:00:00Z" }, today)).toBe(false);
    expect(isOverdue({ category: "next" }, today)).toBe(false);
  });
  it("due within 7 days includes today, the seventh day and anything overdue", () => {
    expect(isDueWithin({ deadline_on: "2026-09-23", category: "next" }, today, 7)).toBe(true);
    expect(isDueWithin({ deadline_on: "2026-09-30", category: "next" }, today, 7)).toBe(true);
    expect(isDueWithin({ deadline_on: "2026-10-01", category: "next" }, today, 7)).toBe(false);
    expect(isDueWithin({ deadline_on: "2026-09-01", category: "next" }, today, 7)).toBe(true);
  });
});

describe("when — what the row shows", () => {
  const today = "2026-09-23";
  it("OVERDUE with the day count, else the window while the date is ahead", () => {
    expect(whenLabel({ deadline_on: "2026-09-20", due_window: "week", category: "next" }, today)).toEqual({ kind: "overdue", days: 3 });
    expect(whenLabel({ deadline_on: "2026-09-30", due_window: "week", category: "next" }, today)).toEqual({ kind: "window", text: "Within a week", date: "2026-09-30" });
    expect(whenLabel({ deadline_on: "2026-09-30", due_window: "month_end", category: "next" }, today)).toEqual({ kind: "window", text: "End of the month", date: "2026-09-30" });
  });
  it("a weekend names the Saturday; a bare date says Due; today says Today", () => {
    expect(whenLabel({ deadline_on: "2026-09-27", scheduled_on: "2026-09-26", due_window: "weekend", category: "next" }, today)).toEqual({ kind: "window", text: "Weekend 26 Sep", date: "2026-09-27" });
    expect(whenLabel({ deadline_on: "2026-11-05", due_window: "date", category: "next" }, today)).toEqual({ kind: "window", text: "Due 5 Nov", date: "2026-11-05" });
    expect(whenLabel({ deadline_on: "2026-09-23", category: "next" }, today)).toEqual({ kind: "window", text: "Today", date: "2026-09-23" });
  });
  it("someday, closed, and undated", () => {
    expect(whenLabel({ someday: true, category: "backlog" }, today)).toEqual({ kind: "someday" });
    expect(whenLabel({ deadline_on: "2026-09-01", category: "done" }, today)).toBeNull();
    expect(whenLabel({ category: "next" }, today)).toBeNull();
  });
});
