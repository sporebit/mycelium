/**
 * Pregnancy weeks from the due date, and the baby's age after the birth.
 * Pure: every function takes "today" as a YYYY-MM-DD in Europe/London.
 *
 * The convention is the one a midwife uses: the due date is 40 weeks
 * (280 days) after the start, and "24+3" means 24 completed weeks and
 * 3 days.
 */

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** A real calendar date. JavaScript reads "2027-02-30" as 2 March, so the date is read back and compared. */
export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = utc(v);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);
export const addDays = (iso: string, days: number) => new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);

export type Pregnancy = {
  /** Completed weeks. */
  week: number;
  /** Days into the current week, 0–6. */
  day: number;
  /** "24+3". */
  label: string;
  trimester: 1 | 2 | 3;
  /** Days until the due date; negative once it has passed. */
  days_to_go: number;
  /** 0–1 of the forty weeks. */
  progress: number;
  /** Past the due date and no birth recorded. */
  past_due: boolean;
};

/** Where things stand today, or null when the date makes no sense as a pregnancy (more than 42 weeks away, or over 3 weeks past). */
export function pregnancyOn(dueOn: string, today: string): Pregnancy | null {
  if (!isDate(dueOn) || !isDate(today)) return null;
  const toGo = daysBetween(today, dueOn);
  const age = 280 - toGo;
  if (age < 0 || toGo < -21) return null;
  const week = Math.floor(age / 7);
  const day = age % 7;
  return {
    week,
    day,
    label: `${week}+${day}`,
    trimester: week < 13 ? 1 : week < 28 ? 2 : 3,
    days_to_go: toGo,
    progress: Math.max(0, Math.min(1, age / 280)),
    past_due: toGo < 0,
  };
}

/** The pregnancy week (completed weeks) a given day fell in, for labelling a timeline entry; null outside the forty-odd weeks. */
export function weekOf(dueOn: string | null, day: string): number | null {
  if (!dueOn) return null;
  const p = pregnancyOn(dueOn, day);
  return p ? p.week : null;
}

export type BabyAge = { days: number; weeks: number; label: string };

/** The baby's age in plain words: days for the first fortnight, weeks to three months, then months. */
export function babyAge(bornOn: string, today: string): BabyAge | null {
  if (!isDate(bornOn) || !isDate(today)) return null;
  const days = daysBetween(bornOn, today);
  if (days < 0) return null;
  const weeks = Math.floor(days / 7);
  let label: string;
  if (days === 0) label = "born today";
  else if (days < 14) label = days === 1 ? "1 day old" : `${days} days old`;
  else if (weeks < 13) label = `${weeks} weeks old`;
  else {
    const b = new Date(utc(bornOn));
    const t = new Date(utc(today));
    let months = (t.getUTCFullYear() - b.getUTCFullYear()) * 12 + (t.getUTCMonth() - b.getUTCMonth());
    if (t.getUTCDate() < b.getUTCDate()) months -= 1;
    label = months === 1 ? "1 month old" : `${months} months old`;
  }
  return { days, weeks, label };
}

/**
 * What usually happens around a given week in England, from the standard
 * NHS antenatal schedule. General signposts for the timeline, not advice:
 * the dates a midwife gives are the ones that count, and the page says so.
 */
export const SIGNPOSTS: ReadonlyArray<{ from: number; to: number; text: string }> = [
  { from: 8, to: 10, text: "The booking appointment with the midwife is usually around now." },
  { from: 11, to: 14, text: "The dating scan is usually offered between 11 and 14 weeks." },
  { from: 16, to: 17, text: "A midwife appointment is usual at about 16 weeks; the whooping cough vaccine is offered from 16 weeks." },
  { from: 18, to: 21, text: "The mid-pregnancy (anomaly) scan is usually offered between 18 and 21 weeks." },
  { from: 20, to: 22, text: "The MAT B1 maternity certificate can be issued from 20 weeks." },
  { from: 25, to: 25, text: "An appointment at about 25 weeks is usual in a first pregnancy." },
  { from: 28, to: 28, text: "An appointment at about 28 weeks is usual, often with blood tests." },
  { from: 30, to: 32, text: "Antenatal classes often start around now." },
  { from: 34, to: 34, text: "An appointment at about 34 weeks is usual; a good time to settle the birth plan." },
  { from: 36, to: 36, text: "An appointment at about 36 weeks is usual. A sensible week to have the hospital bag packed." },
  { from: 37, to: 39, text: "From 37 weeks the pregnancy is full term." },
  { from: 40, to: 42, text: "The due date is a middle estimate; many babies arrive in the two weeks either side." },
];

export function signpostsFor(week: number): string[] {
  return SIGNPOSTS.filter((s) => week >= s.from && week <= s.to).map((s) => s.text);
}
