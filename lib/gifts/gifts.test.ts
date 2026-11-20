import { describe, expect, it } from "vitest";
import { canConvert, purchaseFromGift, urgencyFor } from "./convert";
import { extractGiftFromText, giftFromClassification, giftReadBack, GIFT_SIGNAL_RE } from "./extract";
import { money, occasionTotals } from "./money";
import { dateIn, daysBetween, dobFixes, nextOccurrence, nextYear, plan, upcoming } from "./occasions";
import { decide, nudgeCounts, nudgeText, taskDue, taskTitle } from "./reminders";
import { similarGifts } from "./similar";
import type { GiftRow, OccasionRow } from "./types";

function occ(over: Partial<OccasionRow> = {}): OccasionRow {
  return {
    id: over.id ?? "o1",
    name: "Kirsty's birthday 2026",
    kind: "birthday",
    person_id: "p-kirsty",
    occurs_on: "2026-05-23",
    recurrence: "annual",
    source: "person_dob",
    previous_occasion_id: null,
    budget: null,
    lead_days: [30, 7],
    reminder_task_id: null,
    notes: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function gift(over: Partial<GiftRow> = {}): GiftRow {
  return {
    id: over.id ?? "g1",
    title: "Chef's knife",
    description: null,
    reason: null,
    for_person_id: "p-jake",
    for_label: null,
    occasion_id: null,
    needed_by: null,
    status: "idea",
    rejected_reason: null,
    origin: "manual",
    url: null,
    retailer: null,
    category: null,
    currency: "GBP",
    target_price: null,
    paid_amount: null,
    paid_at: null,
    given_at: null,
    bundle_id: null,
    purchase_id: null,
    price_check: null,
    price_checked_at: null,
    suggestion: null,
    raw_text: null,
    capture_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("occasions: the calendar", () => {
  it("knows the next time a day comes round, today included", () => {
    expect(nextOccurrence(5, 23, "2026-05-23")).toBe("2026-05-23");
    expect(nextOccurrence(5, 23, "2026-05-24")).toBe("2027-05-23");
    expect(nextOccurrence(12, 25, "2026-11-20")).toBe("2026-12-25");
    expect(nextOccurrence(2, 14, "2026-11-20")).toBe("2027-02-14");
  });

  it("a leap-day birthday falls on 28 February in a year without one, and back on the 29th when there is", () => {
    expect(dateIn(2027, 2, 29)).toBe("2027-02-28");
    expect(dateIn(2028, 2, 29)).toBe("2028-02-29");
    expect(nextYear("2028-02-29")).toBe("2029-02-28");
    expect(nextOccurrence(2, 29, "2027-03-01")).toBe("2028-02-29");
  });

  it("counts days on the calendar, not the clock", () => {
    expect(daysBetween("2026-11-20", "2026-12-25")).toBe(35);
    expect(daysBetween("2026-12-25", "2026-11-20")).toBe(-35);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // across the clock change
  });
});

describe("occasions: seeding and roll-forward", () => {
  const people = [
    { id: "p-kirsty", name: "Kirsty", birthday: "1990-05-23" },
    { id: "p-jake", name: "Jake", birthday: "1988-11-02" },
    { id: "p-nodob", name: "Sam", birthday: null },
  ];

  it("seeds a birthday for everyone with one, for its next occurrence, and the fixed calendar", () => {
    const seeds = plan([], people, "2026-11-20");
    expect(seeds.map((s) => [s.kind, s.person_id, s.occurs_on, s.name])).toEqual([
      ["birthday", "p-kirsty", "2027-05-23", "Kirsty's birthday 2027"],
      ["birthday", "p-jake", "2027-11-02", "Jake's birthday 2027"],
      ["christmas", null, "2026-12-25", "Christmas 2026"],
      ["valentines", null, "2027-02-14", "Valentine's Day 2027"],
    ]);
    for (const s of seeds) expect(s.lead_days).toEqual([30, 7]);
    expect(seeds.find((s) => s.kind === "birthday")?.source).toBe("person_dob");
    expect(seeds.find((s) => s.kind === "christmas")?.source).toBe("fixed");
  });

  it("is idempotent: a second run over what the first made plans nothing", () => {
    const first = plan([], people, "2026-11-20");
    const existing = first.map((s, i) => occ({ ...s, id: `o${i}`, recurrence: "annual" }));
    expect(plan(existing, people, "2026-11-20")).toEqual([]);
  });

  it("rolls an annual occasion forward once its day has passed, carrying budget and lead days and pointing back", () => {
    const past = occ({ id: "o-2026", occurs_on: "2026-05-23", budget: 80, lead_days: [45, 14] });
    const seeds = plan([past], [], "2026-05-24", { fixed: false });
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ name: "Kirsty's birthday 2027", kind: "birthday", person_id: "p-kirsty", occurs_on: "2027-05-23", budget: 80, lead_days: [45, 14], previous_occasion_id: "o-2026", source: "person_dob" });
    // the day itself does not roll (it is still that day's occasion)
    expect(plan([past], [], "2026-05-23", { fixed: false })).toEqual([]);
  });

  it("the double-run case: the rolled row already exists, so the old one does not roll again", () => {
    const past = occ({ id: "o-2026", occurs_on: "2026-05-23" });
    const next = occ({ id: "o-2027", occurs_on: "2027-05-23", previous_occasion_id: "o-2026" });
    expect(plan([past, next], [], "2026-05-24", { fixed: false })).toEqual([]);
    // and a person's birthday already instanced is not seeded twice
    expect(plan([past, next], [{ id: "p-kirsty", name: "Kirsty", birthday: "1990-05-23" }], "2026-05-24", { fixed: false })).toEqual([]);
  });

  it("a one-off never rolls, and an archived one is left alone", () => {
    expect(plan([occ({ recurrence: "none", occurs_on: "2026-01-01" })], [], "2026-11-20", { fixed: false })).toEqual([]);
    expect(plan([occ({ archived_at: "2026-06-01T00:00:00Z", occurs_on: "2026-01-01" })], [], "2026-11-20", { fixed: false })).toEqual([]);
  });

  it("an edited date of birth moves the open instance to the right day of its year; a past one stays", () => {
    const open = occ({ id: "o-open", occurs_on: "2027-05-23" });
    const past = occ({ id: "o-past", occurs_on: "2026-05-23" });
    const fixes = dobFixes([open, past], [{ id: "p-kirsty", name: "Kirsty", birthday: "1990-05-25" }], "2026-11-20");
    expect(fixes).toEqual([{ id: "o-open", occurs_on: "2027-05-25", name: "Kirsty's birthday 2027" }]);
  });

  it("lists upcoming soonest first and leaves out the past and the archived", () => {
    const rows = [occ({ id: "a", occurs_on: "2027-01-01" }), occ({ id: "b", occurs_on: "2026-12-01" }), occ({ id: "c", occurs_on: "2026-01-01" }), occ({ id: "d", occurs_on: "2026-12-02", archived_at: "x" })];
    expect(upcoming(rows, "2026-11-20").map((o) => o.id)).toEqual(["b", "a"]);
    expect(upcoming(rows, "2026-11-20", { includePast: true }).map((o) => o.id)).toEqual(["c", "b", "a"]);
  });
});

describe("reminders: lead windows", () => {
  it("opens the task once when the longest window is entered, and not again while the id is stored", () => {
    const o = occ({ occurs_on: "2026-12-25" });
    expect(decide(o, [], "2026-11-24")).toBeNull(); // 31 days: outside
    expect(decide(o, [], "2026-11-25")).toMatchObject({ open_task: true, nudge: 30, days_left: 30 });
    expect(decide({ ...o, reminder_task_id: "t1" }, [], "2026-11-26")).toBeNull(); // 29 days, task exists, no lead day
    // a window entered late (the cron missed a day) still opens the task
    expect(decide(o, [], "2026-11-27")).toMatchObject({ open_task: true, nudge: null });
  });

  it("nudges on each lead day exactly, once, and a final one at two days when nothing is bought", () => {
    const o = occ({ occurs_on: "2026-12-25", reminder_task_id: "t1" });
    expect(decide(o, [], "2026-11-25")?.nudge).toBe(30);
    expect(decide(o, [], "2026-11-26")).toBeNull();
    expect(decide(o, [], "2026-12-18")?.nudge).toBe(7);
    expect(decide(o, [], "2026-12-23")?.nudge).toBe("final");
    expect(decide(o, [gift({ status: "bought" })], "2026-12-23")).toBeNull();
    expect(decide(o, [gift({ status: "shortlisted" })], "2026-12-23")?.nudge).toBe("final");
  });

  it("nothing fires once a gift is given, after the day, or for an archived occasion", () => {
    const o = occ({ occurs_on: "2026-12-25" });
    expect(decide(o, [gift({ status: "given" })], "2026-11-25")).toBeNull();
    expect(decide(o, [], "2026-12-26")).toBeNull();
    expect(decide({ ...o, archived_at: "x" }, [], "2026-11-25")).toBeNull();
  });

  it("names the task and dates it a week before, never in the past", () => {
    const o = occ({ occurs_on: "2026-05-23" });
    expect(taskTitle(o, "Kirsty")).toBe("Gift for Kirsty — birthday, 23 May");
    expect(taskTitle(occ({ kind: "christmas", name: "Christmas 2026", person_id: null, occurs_on: "2026-12-25" }), null)).toBe("Gifts for Christmas 2026 — 25 December");
    expect(taskDue(o, "2026-04-23")).toBe("2026-05-16");
    expect(taskDue(o, "2026-05-20")).toBe("2026-05-20");
  });

  it("the nudge is counts only: no name, no thing, no amount", () => {
    const all = [
      { occasion: occ({ id: "a", occurs_on: "2026-12-25" }), gifts: [gift({ status: "bought", title: "Necklace" })] },
      { occasion: occ({ id: "b", occurs_on: "2026-12-10", name: "Jake's birthday 2026" }), gifts: [gift({ status: "idea" })] },
      { occasion: occ({ id: "c", occurs_on: "2027-03-01" }), gifts: [] },
      { occasion: occ({ id: "d", occurs_on: "2026-12-01" }), gifts: [gift({ status: "given" })] },
    ];
    const counts = nudgeCounts(all, "2026-11-25", 30);
    expect(counts).toEqual({ occasions: 2, horizon_days: 30, nothing_bought: 1 });
    const text = nudgeText(counts);
    expect(text).toBe("2 occasions in the next 30 days, 1 with nothing bought");
    expect(text).not.toMatch(/Kirsty|Jake|Necklace|£/);
    expect(nudgeText({ occasions: 1, horizon_days: 7, nothing_bought: 0 })).toBe("1 occasion in the next 7 days, all with something bought");
  });
});

describe("money", () => {
  it("totals committed and paid against a budget, counting what has no price instead of hiding it", () => {
    const t = occasionTotals(
      [
        gift({ status: "idea", target_price: 500 }),
        gift({ status: "shortlisted", target_price: 40 }),
        gift({ status: "shortlisted", target_price: null }),
        gift({ status: "bought", target_price: 30, paid_amount: 27.5 }),
        gift({ status: "given", paid_amount: 12 }),
        gift({ status: "rejected", target_price: 99 }),
      ],
      100,
    );
    expect(t).toMatchObject({ budget: 100, committed: 79.5, paid: 39.5, unpriced: 1, left: 20.5, counts: { idea: 1, shortlisted: 2, bought: 1, given: 1, rejected: 1 } });
    expect(t.used).toBeCloseTo(0.795);
  });

  it("without a budget there is nothing left and nothing used; with nothing priced the totals are zero", () => {
    expect(occasionTotals([gift({ status: "shortlisted" })], null)).toMatchObject({ budget: null, committed: 0, paid: 0, unpriced: 1, left: null, used: null });
    expect(occasionTotals([], "80" as unknown as number)).toMatchObject({ budget: 80, left: 80, used: 0 });
  });

  it("prints money without trailing zeros", () => {
    expect(money(40)).toBe("£40");
    expect(money(27.5)).toBe("£27.50");
    expect(money(null)).toBe("");
    expect(money(12, "EUR")).toBe("€12");
  });
});

describe("convert to purchase", () => {
  it("maps the gift onto the purchases columns: a want on the shopping list, tagged gift", () => {
    const row = purchaseFromGift(gift({ title: "Chef's knife", target_price: 48, retailer: "Nisbets", category: null, needed_by: "2026-12-01" }), "2026-11-20");
    expect(row).toEqual({ title: "Chef's knife (Nisbets)", amount: 48, currency: "GBP", want_or_need: "want", urgency: "this_month", list_type: "shopping", category: "gifts", context_tag: "gift" });
  });

  it("keeps a real purchase category, drops a made-up one, and copes with no price", () => {
    expect(purchaseFromGift(gift({ category: "electronics" }), "2026-11-20")).toMatchObject({ category: "electronics", amount: null, urgency: "someday" });
    expect(purchaseFromGift(gift({ category: "sharp things" }), "2026-11-20").category).toBe("gifts");
  });

  it("reads urgency off the date it is needed by", () => {
    expect(urgencyFor(null, "2026-11-20")).toBe("someday");
    expect(urgencyFor("2026-11-21", "2026-11-20")).toBe("today");
    expect(urgencyFor("2026-11-26", "2026-11-20")).toBe("this_week");
    expect(urgencyFor("2026-12-15", "2026-11-20")).toBe("this_month");
    expect(urgencyFor("2027-03-01", "2026-11-20")).toBe("someday");
  });

  it("only a shortlisted gift without a purchase can be bought through the action", () => {
    expect(canConvert(gift({ status: "shortlisted" }))).toBeNull();
    expect(canConvert(gift({ status: "idea" }))).toMatch(/Shortlist/);
    expect(canConvert(gift({ status: "bought" }))).toMatch(/already bought/);
    expect(canConvert(gift({ status: "rejected" }))).toMatch(/rejected/);
    expect(canConvert(gift({ status: "shortlisted", purchase_id: "pu" }))).toMatch(/already has a purchase/);
  });
});

describe("capture extraction", () => {
  it("'get X a Y' splits person and title, reads the occasion and the reason", () => {
    const ex = extractGiftFromText("Get Jake a decent chef's knife for his birthday because he keeps complaining his knives are blunt");
    expect(ex).toMatchObject({ title: "decent chef's knife", person: "Jake", occasion: "birthday", reason: "he keeps complaining his knives are blunt", url: null, target_price: null });
  });

  it("'Y for X' and 'X wants a Y'", () => {
    expect(extractGiftFromText("Gift idea: a cast iron pan for Kirsty for Christmas")).toMatchObject({ title: "a cast iron pan", person: "Kirsty", occasion: "christmas" });
    expect(extractGiftFromText("Mum wants a new kettle, she said hers leaks")).toMatchObject({ title: "new kettle", person: "Mum", reason: "she said hers leaks", occasion: null });
    expect(extractGiftFromText("Present for Dan's wedding: a decanter")).toMatchObject({ person: "Dan", occasion: "wedding" });
  });

  it("pulls out a link, a price and a 'by when' and leaves the title clean", () => {
    const ex = extractGiftFromText("Gift for Sam https://example.com/thing about £40 by Friday");
    expect(ex.url).toBe("https://example.com/thing");
    expect(ex.target_price).toBe(40);
    expect(ex.needed_by_relative).toBe("by friday");
    expect(ex.title).not.toMatch(/https|£|Friday/);
  });

  it("a sentence with no person leaves the person null and keeps the title", () => {
    expect(extractGiftFromText("stocking filler idea: hot sauce set")).toMatchObject({ person: null, title: "hot sauce set", occasion: "christmas" });
  });

  it("the signal words recognise a gift idea and nothing else", () => {
    for (const s of ["get Jake a present", "gift idea for mum", "a pressie for Kirsty", "something for his birthday"]) expect(GIFT_SIGNAL_RE.test(s), s).toBe(true);
    for (const s of ["buy milk", "book the dentist", "Jake said the dog is crazy", "remind me at 8pm"]) expect(GIFT_SIGNAL_RE.test(s), s).toBe(false);
  });

  it("the read-back names the person, the occasion, and says when the person is unresolved", () => {
    expect(giftReadBack({ title: "decent chef's knife", person: "Jake", occasion: "birthday" }, "Jake Smith")).toBe('Saved for review — gift idea for Jake Smith: "decent chef\'s knife" (birthday)');
    expect(giftReadBack({ title: "kettle", person: "Mum", occasion: null }, null)).toBe('Saved for review — gift idea for Mum: "kettle" (person unresolved)');
    expect(giftReadBack({ title: "hot sauce set", person: null, occasion: "christmas" }, null)).toBe('Saved for review — gift idea: "hot sauce set" (christmas)');
  });

  it("a model's extraction is cleaned, with the rules filling anything it left out", () => {
    const ex = giftFromClassification({ kind: "gift_idea", title: "Knife", gift: { title: "chef's knife", person: "Jake", occasion: "not-a-kind", target_price: "40" } }, "get Jake a chef's knife for his birthday");
    expect(ex).toMatchObject({ title: "chef's knife", person: "Jake", occasion: "birthday", target_price: null });
    expect(giftFromClassification({ kind: "gift_idea", title: "x" }, "Mum wants a kettle").person).toBe("Mum");
  });
});

describe("near-duplicates", () => {
  const pool = [
    { id: "a", title: "Decent chef's knife", for_person_id: "p-jake", for_label: null, status: "idea" },
    { id: "b", title: "Chef's knife", for_person_id: "p-kirsty", for_label: null, status: "idea" },
    { id: "c", title: "Kettle", for_person_id: null, for_label: "Mum", status: "rejected" },
  ];
  it("warns for the same recipient only, and includes rejected ones (that is the point of keeping them)", () => {
    expect(similarGifts("chef's knife", { for_person_id: "p-jake", for_label: null }, pool).map((s) => s.id)).toEqual(["a"]);
    expect(similarGifts("chef's knife", { for_person_id: "p-sam", for_label: null }, pool)).toEqual([]);
    expect(similarGifts("new kettle", { for_person_id: null, for_label: "mum" }, pool).map((s) => s.id)).toEqual(["c"]);
    expect(similarGifts("Decent chef's knife", { for_person_id: "p-jake", for_label: null }, pool, "a")).toEqual([]);
  });
});
