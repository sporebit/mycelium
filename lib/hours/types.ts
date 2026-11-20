/**
 * Four-Day Week Tracker (0156, claude/four-day-week-spec.md). Row shapes as
 * the API returns them. Every figure the app shows is derived from these in
 * lib/hours/calc.ts; nothing computed is stored.
 */

export type HoursSettings = {
  id: string;
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
  updated_at: string;
};

export type HoursEntry = {
  id: string;
  entry_date: string | null;
  minutes: number | null;
  estimate_minutes: number | null;
  description: string;
  ticket_raw: string;
  ticket_key: string | null;
  logged: boolean;
  source: "manual" | "import";
  source_row: number | null;
  deleted_at: string | null;
  /** 0157: null while the entry waits in the Log's holding section; set by MERGE */
  merged_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AbsenceType = "Annual leave" | "Sick" | "Other";
export const ABSENCE_TYPES: readonly AbsenceType[] = ["Annual leave", "Sick", "Other"];

export type HoursAbsence = {
  id: string;
  absence_date: string;
  type: AbsenceType;
  minutes: number;
  note: string;
};

export type HoursBankHoliday = {
  id: string;
  holiday_date: string;
  name: string;
};

export type HoursImportRun = {
  id: string;
  ran_at: string;
  filename: string;
  format: "json" | "xlsx" | "paste";
  counts: Record<string, number>;
  undone_at: string | null;
};

/** Everything the views need, in one GET (/api/hours/bundle). */
export type HoursBundle = {
  settings: HoursSettings | null;
  entries: HoursEntry[];
  absences: HoursAbsence[];
  bankHolidays: HoursBankHoliday[];
};

export const SETTINGS_SELECT =
  "id, contracted_minutes_per_week, standard_day_minutes, checkpoint_threshold_minutes, checkpoint_label, tracking_start, review_length_weeks, wed_minutes_before_1300, wed_minutes_after_1300, ticket_base_url, catch_all_tickets, block_out_recipients, block_out_subject_template, block_out_body_lines, updated_at";

export const ENTRY_SELECT =
  "id, entry_date, minutes, estimate_minutes, description, ticket_raw, ticket_key, logged, source, source_row, deleted_at, merged_at, created_at, updated_at";

export const ABSENCE_SELECT = "id, absence_date, type, minutes, note";
export const HOLIDAY_SELECT = "id, holiday_date, name";
export const IMPORT_RUN_SELECT = "id, ran_at, filename, format, counts, undone_at";
