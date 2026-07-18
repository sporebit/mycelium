export type BinType = "recycling" | "black";

export type GardenSeason = {
  season_start: string;
  season_end: string;
};

export type Collection = {
  date: string;
  type: BinType;
  gardenIncluded: boolean;
};

const DAY_MS = 86_400_000;

function utcMidnight(d: Date | string | number): number {
  const x = typeof d === "number" ? new Date(d) : typeof d === "string" ? new Date(d) : d;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function getCollectionType(
  date: Date | string | number,
  anchorDate: Date | string | number,
  anchorType: BinType,
): BinType {
  const weeks = Math.round((utcMidnight(date) - utcMidnight(anchorDate)) / (7 * DAY_MS));
  const other: BinType = anchorType === "recycling" ? "black" : "recycling";
  return weeks % 2 === 0 ? anchorType : other;
}

export function isGardenIncluded(
  date: Date | string | number,
  seasons: GardenSeason[],
  type: BinType,
): boolean {
  if (type !== "recycling") return false;
  const d = utcMidnight(date);
  return seasons.some(
    (s) => d >= utcMidnight(s.season_start) && d <= utcMidnight(s.season_end),
  );
}

/**
 * Advances `from` to the next occurrence of `dayOfWeek` (0=Sun..6=Sat), inclusive.
 */
function nextWeekday(from: number, dayOfWeek: number): number {
  const cur = new Date(from).getUTCDay();
  const delta = (dayOfWeek - cur + 7) % 7;
  return from + delta * DAY_MS;
}

export function getNextCollection(
  now: Date,
  config: { collection_day_of_week: number; anchor_date: string; anchor_type: BinType },
  seasons: GardenSeason[],
): Collection {
  const start = nextWeekday(utcMidnight(now), config.collection_day_of_week);
  const type = getCollectionType(start, config.anchor_date, config.anchor_type);
  return {
    date: toISODate(start),
    type,
    gardenIncluded: isGardenIncluded(start, seasons, type),
  };
}

export function getUpcomingCollections(
  now: Date,
  count: number,
  config: { collection_day_of_week: number; anchor_date: string; anchor_type: BinType },
  seasons: GardenSeason[],
): Collection[] {
  const first = nextWeekday(utcMidnight(now), config.collection_day_of_week);
  const out: Collection[] = [];
  for (let i = 0; i < count; i++) {
    const ms = first + i * 7 * DAY_MS;
    const type = getCollectionType(ms, config.anchor_date, config.anchor_type);
    out.push({
      date: toISODate(ms),
      type,
      gardenIncluded: isGardenIncluded(ms, seasons, type),
    });
  }
  return out;
}

export function collectionLabel(c: Collection): string {
  if (c.type === "black") return "Black bin";
  return c.gardenIncluded ? "Recycling + garden" : "Recycling";
}
