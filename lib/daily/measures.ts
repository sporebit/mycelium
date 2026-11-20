/**
 * The eight monthly measures (research §6 "Is it working?"), computed from
 * what actually happened — the plans, their items, the interruptions
 * ledger and the close-outs — never from a counter kept alongside. Shown
 * in the first close-out of a month, about the month before, and kept on
 * that close-out's row so months can be set side by side. Off the home
 * screen.
 *
 * Pure: rows in, numbers out. A measure with nothing to measure is null,
 * not zero: "no data" and "none" are different things.
 */

export type MeasurePlan = {
  day: string;
  status: string;
  proposed_at: string | null;
  prompted_at: string | null;
  accepted_at: string | null;
  items: Array<{ is_win: boolean; state: string; started_at: string | null; finished_at: string | null }>;
};

export type MeasureInterruption = {
  at: string;
  acted_at: string | null;
  origin: string;
  counted: boolean;
};

export type MeasureCloseout = {
  week: string;
  screen_minutes: number | null;
  partner_answers: { helping?: string; costing?: string } | null;
};

export type MonthMeasures = {
  month: string;
  /** 1. Days a week item one was done. Aim: four. */
  win_rate: number | null;
  /** 2. Median minutes from the morning pick to the first Start. */
  start_latency_min: number | null;
  /** 3. Finished ÷ started (aim 1 or above), and things stuck above 80% for over 14 days at month end. */
  finish_ratio: number | null;
  stuck_over_14_days: number;
  /** 4. Share of accepted today-items completed, 0–1. 0.7–0.8 means the plan fits. */
  plan_accuracy: number | null;
  /** 5. Median days to come back after a day with nothing finished. */
  return_days: number | null;
  /** 6. Share of app-started interruptions acted on within 30 minutes, 0–1. */
  nudge_response: number | null;
  /** 7. Weekly Screen Time, averaged over the weeks typed in. */
  screen_minutes_per_week: number | null;
  /** 8. The two questions with Kirsty, latest answers in the month. */
  partner: { helping: string | null; costing: string | null };
  /** How much there was to measure. */
  days_planned: number;
  days_in_month: number;
};

const FINISHED = new Set(["done", "good_enough"]);
const STARTED = new Set(["started", "done", "good_enough"]);

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthMeasures(
  month: string,
  input: { plans: readonly MeasurePlan[]; interruptions: readonly MeasureInterruption[]; closeouts: readonly MeasureCloseout[]; stuck: number },
): MonthMeasures {
  const plans = input.plans.filter((p) => p.day.startsWith(month)).sort((a, b) => a.day.localeCompare(b.day));
  const days = daysInMonth(month);

  // 1. win rate: win days per seven days of the month
  const winDays = plans.filter((p) => p.items.some((i) => i.is_win && FINISHED.has(i.state))).length;
  const win_rate = plans.length ? round1(winDays / (days / 7)) : null;

  // 2. start latency: the morning pick (accepted, else prompted, else proposed) to the first Start that day
  const latencies: number[] = [];
  for (const p of plans) {
    const pick = p.accepted_at ?? p.prompted_at ?? p.proposed_at;
    const starts = p.items.map((i) => (i.started_at ? Date.parse(i.started_at) : NaN)).filter((t) => Number.isFinite(t));
    if (!pick || !starts.length) continue;
    const minutes = (Math.min(...starts) - Date.parse(pick)) / 60_000;
    if (minutes >= 0) latencies.push(minutes);
  }
  const lat = median(latencies);
  const start_latency_min = lat === null ? null : Math.round(lat);

  // 3. finish ratio over the month
  let started = 0;
  let finished = 0;
  let planned = 0;
  for (const p of plans) {
    for (const i of p.items) {
      if (i.state === "swapped") continue;
      if (p.status !== "proposed") planned += 1;
      if (STARTED.has(i.state)) started += 1;
      if (FINISHED.has(i.state)) finished += 1;
    }
  }
  const finish_ratio = started ? round2(finished / started) : null;

  // 4. plan accuracy: of the items on accepted (or closed) days, how many were completed
  let acceptedDone = 0;
  for (const p of plans) if (p.status !== "proposed") for (const i of p.items) if (i.state !== "swapped" && FINISHED.has(i.state)) acceptedDone += 1;
  const plan_accuracy = planned ? round2(acceptedDone / planned) : null;

  // 5. return time: after a day with nothing finished, how many days until one with something finished
  const activeDays = new Set(plans.filter((p) => p.items.some((i) => FINISHED.has(i.state))).map((p) => p.day));
  const gaps: number[] = [];
  let gap = 0;
  let seenActive = false;
  for (let d = 1; d <= days; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (activeDays.has(day)) {
      if (seenActive && gap > 0) gaps.push(gap);
      gap = 0;
      seenActive = true;
    } else if (seenActive) {
      gap += 1;
    }
  }
  const ret = median(gaps);
  const return_days = ret === null ? null : round1(ret);

  // 6. nudge response: app-started, counted, acted on within thirty minutes
  const nudges = input.interruptions.filter((i) => i.origin === "app" && i.counted && i.at.startsWith(month));
  const quick = nudges.filter((i) => i.acted_at && Date.parse(i.acted_at) - Date.parse(i.at) <= 30 * 60_000).length;
  const nudge_response = nudges.length ? round2(quick / nudges.length) : null;

  // 7. screen time: the weeks typed in
  const screens = input.closeouts.map((c) => c.screen_minutes).filter((v): v is number => typeof v === "number");
  const screen_minutes_per_week = screens.length ? Math.round(screens.reduce((a, b) => a + b, 0) / screens.length) : null;

  // 8. the two questions: the latest answers given in the month
  const withAnswers = [...input.closeouts].filter((c) => c.partner_answers).sort((a, b) => a.week.localeCompare(b.week));
  const last = withAnswers[withAnswers.length - 1]?.partner_answers ?? null;

  return {
    month,
    win_rate,
    start_latency_min,
    finish_ratio,
    stuck_over_14_days: input.stuck,
    plan_accuracy,
    return_days,
    nudge_response,
    screen_minutes_per_week,
    partner: { helping: last?.helping ?? null, costing: last?.costing ?? null },
    days_planned: plans.length,
    days_in_month: days,
  };
}

/** The measures as rows for a table: label, this month, last month, and what the research says to aim for. */
export function measureRows(cur: MonthMeasures, prev: MonthMeasures | null): Array<{ key: string; label: string; now: string; before: string; aim: string }> {
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const num = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);
  const hrs = (v: number | null) => (v === null ? "—" : `${Math.round((v / 60) * 10) / 10} h`);
  return [
    { key: "win_rate", label: "Win days a week", now: num(cur.win_rate), before: num(prev?.win_rate ?? null), aim: "4" },
    { key: "start_latency", label: "Pick to first Start", now: num(cur.start_latency_min, " min"), before: num(prev?.start_latency_min ?? null, " min"), aim: "lower" },
    { key: "finish_ratio", label: "Finished ÷ started", now: num(cur.finish_ratio), before: num(prev?.finish_ratio ?? null), aim: "1 or above" },
    { key: "stuck", label: "Stuck above 80% for 14+ days", now: String(cur.stuck_over_14_days), before: prev ? String(prev.stuck_over_14_days) : "—", aim: "0" },
    { key: "plan_accuracy", label: "Accepted items completed", now: pct(cur.plan_accuracy), before: pct(prev?.plan_accuracy ?? null), aim: "70–80%" },
    { key: "return_days", label: "Days to come back", now: num(cur.return_days), before: num(prev?.return_days ?? null), aim: "lower" },
    { key: "nudge_response", label: "Nudges acted on within 30 min", now: pct(cur.nudge_response), before: pct(prev?.nudge_response ?? null), aim: "steady or rising" },
    { key: "screen", label: "Screen Time a week", now: hrs(cur.screen_minutes_per_week), before: hrs(prev?.screen_minutes_per_week ?? null), aim: "lower" },
  ];
}
