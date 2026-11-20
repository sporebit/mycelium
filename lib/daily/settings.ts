/**
 * The daily loop's settings, kept in user_settings.ui_prefs.daily (never
 * localStorage). Every value has a default, so a person who has never
 * opened Settings still gets a working loop.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Soft limit on items in progress; starting past it asks to park one first (rule 21). */
export const DEFAULT_WIP_LIMIT = 3;

export type DailySettings = {
  /** Free minutes per ISO weekday (1 = Monday … 7 = Sunday); missing days use the defaults in propose.ts. */
  free_minutes: Partial<Record<number, number>>;
  /** Soft limit on things in progress (research rule 21). */
  wip_limit: number;
  /** "HH:MM" London: when the evening close is offered if the phone was never plugged in. */
  evening_fallback: string;
  /** "HH:MM" London: when the morning prompt goes out if no alarm stopped. */
  morning_fallback: string;
  /** App-started interruptions per day across push, Telegram and the wall (research rule 26). */
  interruption_budget: number;
  /** Quiet hours, London: nothing app-started is sent in this window. */
  quiet_from: string;
  quiet_to: string;
  /** Completion sound. */
  chime: boolean;
  /** The weekly close-out's slot (research rule 23): ISO day (7 = Sunday) and "HH:MM" London. The same slot every week. */
  closeout_day: number;
  closeout_time: string;
};

export const DAILY_DEFAULTS: DailySettings = {
  free_minutes: {},
  wip_limit: DEFAULT_WIP_LIMIT,
  evening_fallback: "21:30",
  morning_fallback: "08:30",
  interruption_budget: 3,
  quiet_from: "22:00",
  quiet_to: "07:00",
  chime: true,
  closeout_day: 7,
  closeout_time: "18:00",
};

/** The close-out is a box, not a session that runs until it is done (research rule 23). */
export const CLOSEOUT_MINUTES = 45;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Merge stored values over the defaults, dropping anything malformed. Pure. */
export function mergeDailySettings(stored: unknown): DailySettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof DailySettings, unknown>>;
  const out: DailySettings = { ...DAILY_DEFAULTS, free_minutes: {} };
  if (s.free_minutes && typeof s.free_minutes === "object") {
    for (const [k, v] of Object.entries(s.free_minutes as Record<string, unknown>)) {
      const day = Number(k);
      if (Number.isInteger(day) && day >= 1 && day <= 7 && typeof v === "number" && v >= 0 && v <= 960) out.free_minutes[day] = Math.round(v);
    }
  }
  if (typeof s.wip_limit === "number" && s.wip_limit >= 1 && s.wip_limit <= 10) out.wip_limit = Math.round(s.wip_limit);
  if (typeof s.interruption_budget === "number" && s.interruption_budget >= 0 && s.interruption_budget <= 10) out.interruption_budget = Math.round(s.interruption_budget);
  if (typeof s.closeout_day === "number" && s.closeout_day >= 1 && s.closeout_day <= 7) out.closeout_day = Math.round(s.closeout_day);
  for (const key of ["evening_fallback", "morning_fallback", "quiet_from", "quiet_to", "closeout_time"] as const) {
    const v = s[key];
    if (typeof v === "string" && HHMM.test(v)) out[key] = v;
  }
  if (typeof s.chime === "boolean") out.chime = s.chime;
  return out;
}

export async function dailySettings(db: SupabaseClient): Promise<DailySettings> {
  const { data } = await db.from("user_settings").select("ui_prefs").limit(1).maybeSingle();
  const prefs = (data?.ui_prefs ?? {}) as { daily?: unknown };
  return mergeDailySettings(prefs.daily);
}
