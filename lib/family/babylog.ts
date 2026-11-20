/**
 * The baby log: feeds, sleep, nappies. Pure: what a tap means, and what the
 * rows of the last day add up to. One tap makes one row; a sleep is two
 * taps (start, stop) on the same row.
 */

export type LogKind = "feed" | "sleep" | "nappy";
export type FeedHow = "left" | "right" | "both" | "bottle";
export type NappyWhat = "wet" | "dirty" | "both";
export const FEED_HOWS: readonly FeedHow[] = ["left", "right", "both", "bottle"];
export const NAPPY_WHATS: readonly NappyWhat[] = ["wet", "dirty", "both"];

export type LogRow = {
  id: string;
  kind: LogKind;
  started_at: string;
  ended_at: string | null;
  detail: Record<string, unknown>;
  note: string | null;
  created_by: string | null;
};

export type TapInput = { kind?: unknown; how?: unknown; what?: unknown; ml?: unknown; at?: unknown; note?: unknown };
export type Tap = { kind: LogKind; started_at: string; detail: Record<string, unknown>; note: string | null };

/** Turn a tap into a row, or say what is wrong with it. `now` is the default time. */
export function tapToRow(input: TapInput, now: Date): { ok: true; row: Tap } | { ok: false; error: string } {
  const kind = input.kind;
  if (kind !== "feed" && kind !== "sleep" && kind !== "nappy") return { ok: false, error: "kind is feed, sleep or nappy." };
  let at = now;
  if (input.at !== undefined && input.at !== null) {
    const t = typeof input.at === "string" ? Date.parse(input.at) : NaN;
    if (Number.isNaN(t)) return { ok: false, error: "at is a time." };
    // a tap can be put in a little late, never in the future and never from last week
    if (t > now.getTime() + 60_000) return { ok: false, error: "That time has not happened yet." };
    if (t < now.getTime() - 7 * 86_400_000) return { ok: false, error: "That is more than a week ago." };
    at = new Date(t);
  }
  const detail: Record<string, unknown> = {};
  if (kind === "feed") {
    const how = input.how ?? "bottle";
    if (!FEED_HOWS.includes(how as FeedHow)) return { ok: false, error: "how is left, right, both or bottle." };
    detail.how = how;
    if (input.ml !== undefined && input.ml !== null) {
      const ml = Number(input.ml);
      if (!Number.isFinite(ml) || ml <= 0 || ml > 500) return { ok: false, error: "ml is between 1 and 500." };
      detail.ml = Math.round(ml);
    }
  }
  if (kind === "nappy") {
    const what = input.what ?? "wet";
    if (!NAPPY_WHATS.includes(what as NappyWhat)) return { ok: false, error: "what is wet, dirty or both." };
    detail.what = what;
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null;
  return { ok: true, row: { kind, started_at: at.toISOString(), detail, note } };
}

export type LogSummary = {
  /** The newest feed, with how long ago in minutes. */
  last_feed: { at: string; minutes_ago: number; how: string | null; ml: number | null } | null;
  last_nappy: { at: string; minutes_ago: number; what: string | null } | null;
  /** The sleep that is still going, if there is one. */
  asleep: { id: string; since: string; minutes: number } | null;
  /** Since midnight in London. */
  today: { feeds: number; bottle_ml: number; wet: number; dirty: number; sleep_minutes: number };
};

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

/**
 * What the rows add up to. `dayStart` is today's midnight in London, as an
 * instant. A sleep counts towards today for the part of it that falls in
 * today, and one still going counts up to now.
 */
export function summarise(rows: readonly LogRow[], now: Date, dayStart: Date): LogSummary {
  const sorted = [...rows].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const ago = (iso: string) => minutes(now.getTime() - Date.parse(iso));
  const feed = sorted.find((r) => r.kind === "feed");
  const nappy = sorted.find((r) => r.kind === "nappy");
  const open = sorted.find((r) => r.kind === "sleep" && !r.ended_at);
  const today = { feeds: 0, bottle_ml: 0, wet: 0, dirty: 0, sleep_minutes: 0 };
  const start = dayStart.getTime();
  for (const r of sorted) {
    const at = Date.parse(r.started_at);
    if (r.kind === "sleep") {
      const end = r.ended_at ? Date.parse(r.ended_at) : now.getTime();
      const from = Math.max(at, start);
      if (end > from) today.sleep_minutes += minutes(end - from);
      continue;
    }
    if (at < start) continue;
    if (r.kind === "feed") {
      today.feeds += 1;
      if (typeof r.detail.ml === "number") today.bottle_ml += r.detail.ml;
    } else {
      const what = r.detail.what;
      if (what === "wet" || what === "both") today.wet += 1;
      if (what === "dirty" || what === "both") today.dirty += 1;
    }
  }
  return {
    last_feed: feed ? { at: feed.started_at, minutes_ago: ago(feed.started_at), how: typeof feed.detail.how === "string" ? feed.detail.how : null, ml: typeof feed.detail.ml === "number" ? feed.detail.ml : null } : null,
    last_nappy: nappy ? { at: nappy.started_at, minutes_ago: ago(nappy.started_at), what: typeof nappy.detail.what === "string" ? nappy.detail.what : null } : null,
    asleep: open ? { id: open.id, since: open.started_at, minutes: ago(open.started_at) } : null,
    today,
  };
}

/** "2 h 10 min", "45 min", "just now". */
export function span(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "2 h 10 min ago", "45 min ago", "just now". */
export function ago(mins: number): string {
  return mins < 1 ? "just now" : `${span(mins)} ago`;
}

/** A length of time: "2 h 10 min", "45 min", "0 min". */
export function lasted(mins: number): string {
  return mins < 1 ? "0 min" : span(mins);
}

/** The side to offer first: the other one from last time (a breastfeeding convention), else left. */
export function nextSide(lastHow: string | null): "left" | "right" {
  return lastHow === "left" ? "right" : "left";
}
