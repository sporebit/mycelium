/**
 * Notices before a scheduled switch (research rule 27, second half;
 * NHS guidance: advance notice and a visible sequence). A switch is a thing
 * with a time today: a ticket scheduled for a time, or the week's
 * close-out at its slot. Two notices go before each: one about ten minutes
 * out ("find a stopping place"), one about two minutes out ("stop and
 * switch").
 *
 * The tick is every five minutes, so the real gap is said each time ("in 8
 * min", "in 3 min") rather than a round number that would be a lie. The
 * focus timer's own ten- and two-minute lines are said on the screen the
 * timer is on (FocusCard), where there is nothing to interrupt.
 *
 * Pure: the switches and the clock in, the notices due out. noticesServer.ts
 * reads the day and sends through the one door (lib/nudges/interrupt.ts),
 * so each notice is weighed against the budget and written to the ledger.
 */

export type Switch = {
  /** A ticket id, or "closeout". */
  id: string;
  title: string;
  /** When it starts, ISO. */
  at: string;
  kind: "ticket" | "closeout";
};

export type Stage = 10 | 2;

export type NoticeDue = { switch: Switch; stage: Stage; minutes: number };

/** The ledger key a sent notice is remembered by. */
export function noticeKey(id: string, stage: Stage): string {
  return `${id}|${stage}`;
}

export function noticeKind(stage: Stage): string {
  return stage === 10 ? "notice10" : "notice2";
}

/**
 * Which notices are due now. The ten-minute notice is due from ten minutes
 * out until five; the two-minute one from five minutes out until the
 * switch itself. One of each per switch (the caller passes what was sent).
 */
export function dueNotices(switches: readonly Switch[], now: Date, sent: ReadonlySet<string>): NoticeDue[] {
  const out: NoticeDue[] = [];
  for (const s of switches) {
    const minutes = Math.ceil((Date.parse(s.at) - now.getTime()) / 60_000);
    if (minutes <= 0 || minutes > 10) continue;
    const stage: Stage = minutes > 5 ? 10 : 2;
    if (sent.has(noticeKey(s.id, stage))) continue;
    // The late notice goes even if the early one was never sent (the tick
    // may have been off), but never both in one tick: one switch, one line.
    out.push({ switch: s, stage, minutes });
  }
  return out;
}

/** "YYYY-MM-DD" + "HH:MM[:SS]" in London → ISO instant. */
export function londonInstant(day: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  // Find the UTC offset London has on that day by formatting a guess.
  const guess = new Date(`${day}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00Z`);
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(guess));
  const offsetHours = ((londonHour - h + 36) % 24) - 12; // 0 in winter, 1 in summer
  return new Date(guess.getTime() - offsetHours * 3_600_000).toISOString();
}
