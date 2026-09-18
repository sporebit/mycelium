/**
 * Day log settings (spec §3 rules): behaviour, not UI, so they live in
 * `user_settings.daylog` (jsonb, 0127), read through RLS like ui_prefs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCORE_KEYS } from "./scores";

export type DaylogSettings = {
  enabled: boolean;
  prompt_time: string; // "HH:MM" Europe/London
  snooze_minutes: number;
  cutoff: string; // "HH:MM" — nothing after this; the day closes as skipped
  turn_cap: number;
  min_probes: number;
  slots: string[];
  scores: string[];
  persona_agent_id: string | null;
  seeds: { calendar: boolean; spotify: boolean; media: boolean; health: boolean; weather: boolean };
  monthly_alert_pence: number;
};

export const DAYLOG_DEFAULTS: DaylogSettings = {
  enabled: true,
  prompt_time: "21:30",
  snooze_minutes: 60,
  cutoff: "03:00",
  turn_cap: 15,
  min_probes: 3,
  slots: ["where", "who", "ate/drank", "cost", "memorable", "anything else"],
  scores: [...DEFAULT_SCORE_KEYS],
  persona_agent_id: "da_boi",
  seeds: { calendar: true, spotify: true, media: true, health: true, weather: true },
  monthly_alert_pence: 500,
};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Merge a stored blob over the defaults, dropping anything unusable. */
export function daylogSettings(raw: unknown): DaylogSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strList = (v: unknown, fallback: string[]) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? (v as string[]).map((x) => x.trim()).filter(Boolean) : fallback;
  const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
  const seeds = (o.seeds && typeof o.seeds === "object" ? o.seeds : {}) as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DAYLOG_DEFAULTS.enabled,
    prompt_time: typeof o.prompt_time === "string" && HM.test(o.prompt_time) ? o.prompt_time : DAYLOG_DEFAULTS.prompt_time,
    snooze_minutes: num(o.snooze_minutes, DAYLOG_DEFAULTS.snooze_minutes, 5, 240),
    cutoff: typeof o.cutoff === "string" && HM.test(o.cutoff) ? o.cutoff : DAYLOG_DEFAULTS.cutoff,
    turn_cap: num(o.turn_cap, DAYLOG_DEFAULTS.turn_cap, 3, 40),
    min_probes: num(o.min_probes, DAYLOG_DEFAULTS.min_probes, 0, 10),
    slots: strList(o.slots, DAYLOG_DEFAULTS.slots),
    scores: strList(o.scores, DAYLOG_DEFAULTS.scores).map((s) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_")),
    persona_agent_id: typeof o.persona_agent_id === "string" && o.persona_agent_id ? o.persona_agent_id : o.persona_agent_id === null ? null : DAYLOG_DEFAULTS.persona_agent_id,
    seeds: {
      calendar: typeof seeds.calendar === "boolean" ? seeds.calendar : true,
      spotify: typeof seeds.spotify === "boolean" ? seeds.spotify : true,
      media: typeof seeds.media === "boolean" ? seeds.media : true,
      health: typeof seeds.health === "boolean" ? seeds.health : true,
      weather: typeof seeds.weather === "boolean" ? seeds.weather : true,
    },
    monthly_alert_pence: num(o.monthly_alert_pence, DAYLOG_DEFAULTS.monthly_alert_pence, 0, 100000),
  };
}

export async function getDaylogSettings(db: SupabaseClient): Promise<DaylogSettings> {
  const { data } = await db.from("user_settings").select("daylog").limit(1).maybeSingle();
  return daylogSettings((data as { daylog?: unknown } | null)?.daylog);
}
