/**
 * Readers for the Settings page's writes (spec §5 Settings: targets,
 * absences, bank holidays, ticket base URL, block-out text). Pure, shared by
 * the API routes and unit-tested. Minutes fields take a number of minutes or
 * a typed duration (`37:30`, `7.5h`).
 */
import { isDateKey, parseDuration } from "./calc";
import { ABSENCE_TYPES, type AbsenceType } from "./types";

export type SettingsWrite = Partial<{
  contracted_minutes_per_week: number;
  standard_day_minutes: number;
  checkpoint_threshold_minutes: number;
  checkpoint_label: string;
  tracking_start: string;
  review_length_weeks: number;
  wed_minutes_before_1300: number;
  wed_minutes_after_1300: number;
  ticket_base_url: string;
  catch_all_tickets: Array<{ key: string; purpose: string }>;
  block_out_recipients: string[];
  block_out_subject_template: string;
  block_out_body_lines: string[];
}>;

type Read<T> = { ok: true; fields: T } | { ok: false; error: string };

const MINUTE_FIELDS: Array<{ key: keyof SettingsWrite; label: string; min: number; max: number }> = [
  { key: "contracted_minutes_per_week", label: "Weekly target", min: 1, max: 10080 },
  { key: "standard_day_minutes", label: "Standard day", min: 1, max: 1440 },
  { key: "checkpoint_threshold_minutes", label: "Checkpoint threshold", min: 0, max: 10080 },
  { key: "wed_minutes_before_1300", label: "Wednesday before 13:00", min: 0, max: 1440 },
  { key: "wed_minutes_after_1300", label: "Wednesday after 13:00", min: 0, max: 1440 },
];

/** Minutes from a number, `h:mm` or `Nh` of any size (a weekly target is more than a day), or a typed duration. */
function minutesOf(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isInteger(v) ? v : undefined;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{1,4}):(\d{1,2})$/)) && Number(m[2]) <= 59) return Number(m[1]) * 60 + Number(m[2]);
    if ((m = t.match(/^(\d{1,4})(?:\.(\d{1,3}))?\s*h(?:ours?|rs?)?$/))) return Math.round(Number(`${m[1]}.${m[2] ?? "0"}`) * 60);
    const n = parseDuration(t);
    if (n !== null) return n;
    const plain = Number(t);
    return Number.isInteger(plain) ? plain : undefined;
  }
  return undefined;
}

function strList(v: unknown): string[] | undefined {
  if (typeof v === "string") return v.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return (v as string[]).map((s) => s.trim());
  return undefined;
}

export function readSettingsInput(body: unknown): Read<SettingsWrite> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  const out: SettingsWrite = {};
  for (const f of MINUTE_FIELDS) {
    if (!(f.key in b)) continue;
    const n = minutesOf(b[f.key]);
    if (n === undefined || n < f.min || n > f.max) return { ok: false, error: `${f.label} must be between ${f.min} and ${f.max} minutes.` };
    (out as Record<string, unknown>)[f.key] = n;
  }
  if ("checkpoint_label" in b) {
    if (typeof b.checkpoint_label !== "string") return { ok: false, error: "Checkpoint label must be text." };
    out.checkpoint_label = b.checkpoint_label.trim().slice(0, 80);
  }
  if ("tracking_start" in b) {
    if (!isDateKey(b.tracking_start)) return { ok: false, error: "Tracking start must be YYYY-MM-DD." };
    out.tracking_start = b.tracking_start;
  }
  if ("review_length_weeks" in b) {
    const n = typeof b.review_length_weeks === "number" ? b.review_length_weeks : Number(b.review_length_weeks);
    if (!Number.isInteger(n) || n < 1 || n > 104) return { ok: false, error: "Review length must be 1 to 104 weeks." };
    out.review_length_weeks = n;
  }
  if ("ticket_base_url" in b) {
    if (typeof b.ticket_base_url !== "string") return { ok: false, error: "Ticket base URL must be text." };
    const u = b.ticket_base_url.trim();
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "Ticket base URL must start with http:// or https://." };
    out.ticket_base_url = u.slice(0, 500);
  }
  if ("catch_all_tickets" in b) {
    const v = b.catch_all_tickets;
    if (!Array.isArray(v)) return { ok: false, error: "Catch-all tickets must be a list." };
    const list: Array<{ key: string; purpose: string }> = [];
    for (const item of v) {
      if (!item || typeof item !== "object") return { ok: false, error: "Each catch-all ticket needs a key." };
      const o = item as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key.trim() : "";
      if (!key) continue;
      list.push({ key: key.slice(0, 100), purpose: typeof o.purpose === "string" ? o.purpose.trim().slice(0, 200) : "" });
    }
    out.catch_all_tickets = list;
  }
  if ("block_out_recipients" in b) {
    const l = strList(b.block_out_recipients);
    if (!l) return { ok: false, error: "Recipients must be a list of addresses." };
    out.block_out_recipients = l.filter(Boolean);
  }
  if ("block_out_subject_template" in b) {
    if (typeof b.block_out_subject_template !== "string") return { ok: false, error: "Subject must be text." };
    out.block_out_subject_template = b.block_out_subject_template.trim().slice(0, 300);
  }
  if ("block_out_body_lines" in b) {
    const v = b.block_out_body_lines;
    const lines = typeof v === "string" ? v.split(/\r?\n/) : Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
    if (!lines) return { ok: false, error: "Body must be text." };
    out.block_out_body_lines = lines.map((l) => l.replace(/\s+$/, "")).slice(0, 50);
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nothing to change." };
  return { ok: true, fields: out };
}

export type AbsenceWrite = { absence_date: string; type: AbsenceType; minutes: number; note: string };

export function readAbsenceInput(body: unknown, stdDay: number): Read<AbsenceWrite> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  if (!isDateKey(b.absence_date)) return { ok: false, error: "Date must be YYYY-MM-DD." };
  const type = typeof b.type === "string" && (ABSENCE_TYPES as readonly string[]).includes(b.type) ? (b.type as AbsenceType) : null;
  if (!type) return { ok: false, error: `Type must be one of ${ABSENCE_TYPES.join(", ")}.` };
  let minutes = stdDay;
  if (b.minutes !== undefined && b.minutes !== null && b.minutes !== "") {
    const n = minutesOf(b.minutes);
    if (n === undefined || n < 0 || n > 1440) return { ok: false, error: "Minutes must be between 0 and 24:00." };
    minutes = n;
  }
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
  return { ok: true, fields: { absence_date: b.absence_date, type, minutes, note } };
}

export type HolidayWrite = { holiday_date: string; name: string };

export function readHolidayInput(body: unknown): Read<HolidayWrite> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  if (!isDateKey(b.holiday_date)) return { ok: false, error: "Date must be YYYY-MM-DD." };
  return { ok: true, fields: { holiday_date: b.holiday_date, name: typeof b.name === "string" ? b.name.trim().slice(0, 120) : "" } };
}

/** gov.uk bank-holidays.json → England and Wales events as { holiday_date, name }, dated `from` onwards. */
export function readGovUkHolidays(json: unknown, from: string): HolidayWrite[] {
  if (!json || typeof json !== "object") return [];
  const div = (json as Record<string, unknown>)["england-and-wales"];
  if (!div || typeof div !== "object") return [];
  const events = (div as Record<string, unknown>).events;
  if (!Array.isArray(events)) return [];
  const out: HolidayWrite[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const o = ev as Record<string, unknown>;
    if (!isDateKey(o.date) || o.date < from) continue;
    out.push({ holiday_date: o.date, name: typeof o.title === "string" ? o.title : "" });
  }
  return out;
}
