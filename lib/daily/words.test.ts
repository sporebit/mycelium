import { describe, expect, it } from "vitest";
import { about, bannedIn, BUTTONS, CLOSEOUT, closeoutNotice, defaultFirstStep, eveningPrompt, fillLine, finishLine, LABELS, lifetimeLine, morningPrompt, moved, nextUp, spoken, switchNotice, timeCheck, timerNotice, trimTitle } from "./words";

const card = { title: "Boiler quote", firstStep: "Find the email from Dave.", minutes: 5 };

describe("the wording table (research §3)", () => {
  it("says the lines the table gives as examples", () => {
    expect(nextUp(card)).toBe("Next up: Boiler quote. First step: Find the email from Dave. About 5 min.");
    expect(moved("Boiler quote", "tomorrow")).toBe("Boiler quote moved to tomorrow.");
    expect(finishLine("the shed", 2, "order the hinges")).toBe("Two steps left on the shed. Next: order the hinges.");
    expect(timeCheck("14:10", 20)).toBe("It's 14:10. This takes about 20 min.");
    expect(LABELS.welcomeBack).toBe("Welcome back. Nothing's been lost. Here's one thing.");
  });

  it("never uses a word from the never-use column, in any fixed string or produced sentence", () => {
    const produced = [
      ...Object.values(BUTTONS),
      ...Object.values(LABELS),
      nextUp(card),
      nextUp({ title: "A", firstStep: "B", minutes: 240 }),
      morningPrompt(card, 4).title,
      morningPrompt(card, 4).body,
      morningPrompt(card, 0).body,
      morningPrompt(null, 0).body,
      eveningPrompt(0, 0).body,
      eveningPrompt(0, 3).body,
      eveningPrompt(3, 2).body,
      eveningPrompt(1, 0).title,
      moved("Boiler quote", "Friday"),
      spoken(card),
      timeCheck("09:00", 45),
      finishLine("the shed", 1, null),
      finishLine("the shed", 12, "paint"),
      defaultFirstStep("Boiler quote"),
      about(5),
      about(75),
      // the weekly close-out and the notices (Stream B, part 2)
      ...Object.values(CLOSEOUT),
      fillLine({ win_days: 0, finished: 0, started: 0 }),
      fillLine({ win_days: 3, finished: 5, started: 7 }),
      lifetimeLine({ win_days: 0, finished: 0, weeks_closed: 0 }),
      switchNotice("Dentist", 9).title,
      switchNotice("Dentist", 9).body,
      switchNotice("Dentist", 2).body,
      closeoutNotice(10).title,
      closeoutNotice(10).body,
      timerNotice(10) ?? "",
      timerNotice(2) ?? "",
    ];
    for (const text of produced) expect(bannedIn(text), `"${text}"`).toBeNull();
  });

  it("the checker itself catches the banned phrases", () => {
    for (const bad of ["This is overdue", "You missed it", "Don't forget the bins", "You still haven't called", "You should start", "Just do it", "Only two left", "You're running late", "Hurry", "You've been away 9 days", "So close — don't give up now!", "Why haven't you used Recipes?"]) {
      expect(bannedIn(bad), bad).not.toBeNull();
    }
    expect(bannedIn("Recipes has been quiet since August. Keep, pause or retire?")).toBeNull();
    // "late" inside another word is not the word "late".
    expect(bannedIn("Translate the plate label")).toBeNull();
  });
});

describe("shape of the lines", () => {
  it("keeps what the wall says to twelve words (rule 29)", () => {
    const long = spoken({ title: "Ring the plumber about the boiler quote before the weekend comes round again", firstStep: "x", minutes: 20 });
    expect(long.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("rounds time to five minutes and reads hours plainly", () => {
    expect(about(3)).toBe("About 5 min");
    expect(about(44)).toBe("About 45 min");
    expect(about(60)).toBe("About 1 h");
    expect(about(75)).toBe("About 1 h 15 min");
  });

  it("opens the evening with what got done, including when that is nothing", () => {
    expect(eveningPrompt(3, 1).body).toBe("3 finished today. 1 to move or drop. About 2 minutes.");
    expect(eveningPrompt(0, 2).body.startsWith("Nothing finished today, and that is fine.")).toBe(true);
  });

  it("says how many extras there are, and nothing when there are none", () => {
    expect(morningPrompt(card, 3).body).toBe("First step: Find the email from Dave. About 5 min. Then 3 more if there's time.");
    expect(morningPrompt(card, 0).body).toBe("First step: Find the email from Dave. About 5 min.");
  });

  it("shortens a long title with an ellipsis, not mid-air", () => {
    const t = trimTitle("a ".repeat(80), 20);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t.endsWith("…")).toBe(true);
  });
});
