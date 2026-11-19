/**
 * Import for the Four-Day Week Tracker (spec §6). The database is the
 * master; a file is upserted into it, never the other way round.
 *
 * The file shape is the seed / JSON-backup shape:
 *   { exportedAt?, settings?, absences?, bankHolidays?, blockOut?, logEntries }
 * An entry carries `id` (an export), or `sourceRow` (the workbook row,
 * which makes the first load idempotent), or neither (a paste).
 *
 * Matching, per entry:
 *   1. `id`         → the row with that id: unchanged / changed / conflict
 *   2. `sourceRow`  → the row imported from that workbook row, likewise
 *   3. neither      → unchanged if an identical live row (date, minutes,
 *                     description, ticket) exists and is not already matched,
 *                     else inserted
 * A row that was soft-deleted in Mycelium is left deleted (an import never
 * resurrects, just as it never deletes). Absences and bank holidays are
 * inserted when their date is new and otherwise left alone. Settings keys
 * present in the file are patched.
 *
 * Conflict = the file row differs from the database row AND the database
 * row changed after the file was exported (`exportedAt`). Phil picks a side
 * per conflict before the plan can be applied. One transaction: the plan
 * goes to hours_apply_import() (0156), which also records the undo data.
 */
import { isDateKey } from "./calc";
import { keyFor } from "./ticket";
import { ABSENCE_TYPES, type AbsenceType, type HoursAbsence, type HoursBankHoliday, type HoursEntry, type HoursSettings } from "./types";

export type FileEntry = {
  id?: string | null;
  sourceRow?: number | null;
  date: string | null;
  minutes: number | null;
  estimateMinutes?: number | null;
  description?: string | null;
  ticketRaw?: string | null;
  logged?: boolean | null;
};

export type FileSettings = Partial<{
  contractedMinutesPerWeek: number;
  standardDayMinutes: number;
  checkpointThresholdMinutes: number;
  checkpointLabel: string;
  trackingStart: string;
  reviewLengthWeeks: number;
  wedMinutesBefore1300: number;
  wedMinutesAfter1300: number;
  ticketBaseUrl: string;
  catchAllTickets: Array<{ key: string; purpose: string }>;
}>;

export type ImportFile = {
  exportedAt?: string | null;
  settings?: FileSettings | null;
  absences?: Array<{ date: string; type?: string | null; minutes?: number | null }> | null;
  bankHolidays?: Array<{ date: string; name?: string | null }> | null;
  blockOut?: { recipients?: string[]; subjectTemplate?: string; bodyLines?: string[] } | null;
  logEntries: FileEntry[];
};

/** The comparable fields of an entry, normalised the same way for both sides. */
export type EntryFields = {
  entry_date: string | null;
  minutes: number | null;
  estimate_minutes: number | null;
  description: string;
  ticket_raw: string;
  logged: boolean;
};

export type PlanInsert = EntryFields & { ticket_key: string | null; source_row: number | null };
export type PlanUpdate = { id: string; before: EntryFields; after: EntryFields & { ticket_key: string | null } };
export type PlanConflict = { id: string; file: EntryFields; db: EntryFields; db_updated_at: string };

export type SettingsPatch = Partial<Omit<HoursSettings, "id" | "updated_at">>;

export type ImportPlan = {
  filename: string;
  format: "json" | "xlsx" | "paste";
  entries_insert: PlanInsert[];
  entries_update: PlanUpdate[];
  conflicts: PlanConflict[];
  unchanged: number;
  /** matched a row that is deleted in Mycelium: left alone */
  skipped_deleted: number;
  absences_insert: Array<{ absence_date: string; type: AbsenceType; minutes: number }>;
  absences_unchanged: number;
  holidays_insert: Array<{ holiday_date: string; name: string }>;
  holidays_unchanged: number;
  settings: SettingsPatch | null;
  settings_changes: Array<{ field: string; from: unknown; to: unknown }>;
  /** rows the file carried that could not be read, with why */
  rejected: Array<{ row: number; reason: string }>;
  counts: Record<string, number>;
};

export class ImportFileError extends Error {}

function asInt(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || Math.round(n) !== n) return undefined;
  return n;
}

function asStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Read a parsed JSON value as an ImportFile, or throw a readable error. */
export function readImportFile(json: unknown): ImportFile {
  if (!json || typeof json !== "object") throw new ImportFileError("The file is not a JSON object.");
  const o = json as Record<string, unknown>;
  const entries = o.logEntries ?? o.entries;
  if (!Array.isArray(entries)) throw new ImportFileError("The file has no logEntries array.");
  const file: ImportFile = { logEntries: [] };
  if (typeof o.exportedAt === "string") file.exportedAt = o.exportedAt;
  for (const [i, raw] of entries.entries()) {
    if (!raw || typeof raw !== "object") throw new ImportFileError(`logEntries[${i}] is not an object.`);
    const r = raw as Record<string, unknown>;
    file.logEntries.push({
      id: typeof r.id === "string" ? r.id : null,
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : typeof r.source_row === "number" ? r.source_row : null,
      date: r.date === null || r.date === undefined ? null : asStr(r.date) || null,
      minutes: r.minutes === null || r.minutes === undefined || r.minutes === "" ? null : (r.minutes as number),
      estimateMinutes: r.estimateMinutes === undefined ? (r.estimate_minutes as number | null | undefined) ?? null : (r.estimateMinutes as number | null),
      description: asStr(r.description),
      ticketRaw: asStr(r.ticketRaw ?? r.ticket_raw ?? r.ticket),
      logged: r.logged === true || r.logged === "x" || r.logged === "X" || r.logged === 1,
    });
  }
  if (o.settings && typeof o.settings === "object") file.settings = o.settings as FileSettings;
  if (Array.isArray(o.absences)) file.absences = o.absences as ImportFile["absences"];
  if (Array.isArray(o.bankHolidays)) file.bankHolidays = o.bankHolidays as ImportFile["bankHolidays"];
  if (o.blockOut && typeof o.blockOut === "object") file.blockOut = o.blockOut as ImportFile["blockOut"];
  return file;
}

export function fieldsOf(e: Pick<HoursEntry, "entry_date" | "minutes" | "estimate_minutes" | "description" | "ticket_raw" | "logged">): EntryFields {
  return {
    entry_date: e.entry_date,
    minutes: e.minutes,
    estimate_minutes: e.estimate_minutes,
    description: (e.description ?? "").trim(),
    ticket_raw: (e.ticket_raw ?? "").trim(),
    logged: !!e.logged,
  };
}

function sameFields(a: EntryFields, b: EntryFields): boolean {
  return (
    a.entry_date === b.entry_date &&
    a.minutes === b.minutes &&
    a.estimate_minutes === b.estimate_minutes &&
    a.description === b.description &&
    a.ticket_raw === b.ticket_raw &&
    a.logged === b.logged
  );
}

function identityKey(f: EntryFields): string {
  return JSON.stringify([f.entry_date, f.minutes, f.description, f.ticket_raw]);
}

/** Validate one file entry into comparable fields, or say why not. */
export function entryFields(fe: FileEntry): { ok: true; fields: EntryFields } | { ok: false; reason: string } {
  if (fe.date !== null && fe.date !== undefined && !isDateKey(fe.date)) return { ok: false, reason: `date "${fe.date}" is not YYYY-MM-DD` };
  const minutes = asInt(fe.minutes);
  if (minutes === undefined || (minutes !== null && (minutes < 0 || minutes > 1440))) return { ok: false, reason: `minutes "${fe.minutes}" is not 0 to 1440` };
  const estimate = asInt(fe.estimateMinutes);
  if (estimate === undefined || (estimate !== null && (estimate < 0 || estimate > 1440))) return { ok: false, reason: `estimate "${fe.estimateMinutes}" is not 0 to 1440` };
  return {
    ok: true,
    fields: {
      entry_date: fe.date ?? null,
      minutes,
      estimate_minutes: estimate,
      description: asStr(fe.description),
      ticket_raw: asStr(fe.ticketRaw),
      logged: !!fe.logged,
    },
  };
}

export type Current = {
  settings: HoursSettings | null;
  /** every entry of the space, deleted ones included (they still match by id / sourceRow) */
  entries: HoursEntry[];
  absences: HoursAbsence[];
  bankHolidays: HoursBankHoliday[];
};

export type PlanOptions = {
  filename: string;
  format: "json" | "xlsx" | "paste";
  /** Phil's choice per conflict id: take the file's row, or keep the database's */
  resolutions?: Record<string, "file" | "db">;
};

export function settingsPatch(file: ImportFile): SettingsPatch | null {
  const s = file.settings ?? {};
  const b = file.blockOut ?? null;
  const patch: SettingsPatch = {};
  if (typeof s.contractedMinutesPerWeek === "number") patch.contracted_minutes_per_week = s.contractedMinutesPerWeek;
  if (typeof s.standardDayMinutes === "number") patch.standard_day_minutes = s.standardDayMinutes;
  if (typeof s.checkpointThresholdMinutes === "number") patch.checkpoint_threshold_minutes = s.checkpointThresholdMinutes;
  if (typeof s.checkpointLabel === "string") patch.checkpoint_label = s.checkpointLabel;
  if (typeof s.trackingStart === "string" && isDateKey(s.trackingStart)) patch.tracking_start = s.trackingStart;
  if (typeof s.reviewLengthWeeks === "number") patch.review_length_weeks = s.reviewLengthWeeks;
  if (typeof s.wedMinutesBefore1300 === "number") patch.wed_minutes_before_1300 = s.wedMinutesBefore1300;
  if (typeof s.wedMinutesAfter1300 === "number") patch.wed_minutes_after_1300 = s.wedMinutesAfter1300;
  if (typeof s.ticketBaseUrl === "string") patch.ticket_base_url = s.ticketBaseUrl;
  if (Array.isArray(s.catchAllTickets)) patch.catch_all_tickets = s.catchAllTickets.map((t) => ({ key: asStr(t?.key), purpose: asStr(t?.purpose) })).filter((t) => t.key);
  if (b) {
    if (Array.isArray(b.recipients)) patch.block_out_recipients = b.recipients.map(asStr).filter(Boolean);
    if (typeof b.subjectTemplate === "string") patch.block_out_subject_template = b.subjectTemplate;
    if (Array.isArray(b.bodyLines)) patch.block_out_body_lines = b.bodyLines.map((l) => String(l ?? ""));
  }
  return Object.keys(patch).length ? patch : null;
}

function settingsChanges(patch: SettingsPatch | null, current: HoursSettings | null): ImportPlan["settings_changes"] {
  if (!patch) return [];
  const out: ImportPlan["settings_changes"] = [];
  for (const [field, to] of Object.entries(patch)) {
    const from = current ? (current as unknown as Record<string, unknown>)[field] : undefined;
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field, from: from ?? null, to });
  }
  return out;
}

/** The dry run. Pure: nothing is written. */
export function planImport(file: ImportFile, current: Current, opts: PlanOptions): ImportPlan {
  const byId = new Map(current.entries.map((e) => [e.id, e]));
  const bySourceRow = new Map<number, HoursEntry>();
  for (const e of current.entries) if (e.source_row !== null) bySourceRow.set(e.source_row, e);
  // live, unmatched rows by identity, for id-less and row-less entries (a paste)
  const byIdentity = new Map<string, HoursEntry[]>();
  for (const e of current.entries) {
    if (e.deleted_at) continue;
    const k = identityKey(fieldsOf(e));
    byIdentity.set(k, [...(byIdentity.get(k) ?? []), e]);
  }
  const matched = new Set<string>();
  const exportedAt = file.exportedAt && !Number.isNaN(Date.parse(file.exportedAt)) ? Date.parse(file.exportedAt) : null;
  const resolutions = opts.resolutions ?? {};

  const plan: ImportPlan = {
    filename: opts.filename,
    format: opts.format,
    entries_insert: [],
    entries_update: [],
    conflicts: [],
    unchanged: 0,
    skipped_deleted: 0,
    absences_insert: [],
    absences_unchanged: 0,
    holidays_insert: [],
    holidays_unchanged: 0,
    settings: null,
    settings_changes: [],
    rejected: [],
    counts: {},
  };

  const compare = (db: HoursEntry, fields: EntryFields) => {
    if (matched.has(db.id)) {
      // two file rows pointing at one database row: the second is a new row
      plan.entries_insert.push({ ...fields, ticket_key: keyFor(fields.ticket_raw), source_row: null });
      return;
    }
    matched.add(db.id);
    if (db.deleted_at) {
      plan.skipped_deleted += 1;
      return;
    }
    const before = fieldsOf(db);
    if (sameFields(before, fields)) {
      plan.unchanged += 1;
      return;
    }
    const changedSinceExport = exportedAt !== null && Date.parse(db.updated_at) > exportedAt;
    const choice = resolutions[db.id];
    if (changedSinceExport && !choice) {
      plan.conflicts.push({ id: db.id, file: fields, db: before, db_updated_at: db.updated_at });
      return;
    }
    if (choice === "db") {
      plan.unchanged += 1;
      return;
    }
    plan.entries_update.push({ id: db.id, before, after: { ...fields, ticket_key: keyFor(fields.ticket_raw) } });
  };

  file.logEntries.forEach((fe, i) => {
    const v = entryFields(fe);
    if (!v.ok) {
      plan.rejected.push({ row: fe.sourceRow ?? i + 1, reason: v.reason });
      return;
    }
    const fields = v.fields;
    if (fe.id) {
      const db = byId.get(fe.id);
      if (db) return compare(db, fields);
      // an id we do not know (another space's export, or a row hard-deleted): a new row
      plan.entries_insert.push({ ...fields, ticket_key: keyFor(fields.ticket_raw), source_row: fe.sourceRow ?? null });
      return;
    }
    if (fe.sourceRow !== null && fe.sourceRow !== undefined) {
      const db = bySourceRow.get(fe.sourceRow);
      if (db) return compare(db, fields);
      plan.entries_insert.push({ ...fields, ticket_key: keyFor(fields.ticket_raw), source_row: fe.sourceRow });
      return;
    }
    const twins = byIdentity.get(identityKey(fields)) ?? [];
    const twin = twins.find((t) => !matched.has(t.id));
    if (twin) {
      matched.add(twin.id);
      plan.unchanged += 1;
      return;
    }
    plan.entries_insert.push({ ...fields, ticket_key: keyFor(fields.ticket_raw), source_row: null });
  });

  const absenceDates = new Set(current.absences.map((a) => a.absence_date));
  for (const a of file.absences ?? []) {
    if (!a || !isDateKey(a.date)) {
      plan.rejected.push({ row: 0, reason: `absence date "${a?.date}" is not YYYY-MM-DD` });
      continue;
    }
    if (absenceDates.has(a.date)) {
      plan.absences_unchanged += 1;
      continue;
    }
    absenceDates.add(a.date);
    const type = (ABSENCE_TYPES as readonly string[]).includes(asStr(a.type)) ? (asStr(a.type) as AbsenceType) : "Annual leave";
    const minutes = asInt(a.minutes);
    plan.absences_insert.push({ absence_date: a.date, type, minutes: minutes === undefined || minutes === null ? 450 : Math.min(1440, Math.max(0, minutes)) });
  }

  const holidayDates = new Set(current.bankHolidays.map((h) => h.holiday_date));
  for (const h of file.bankHolidays ?? []) {
    if (!h || !isDateKey(h.date)) {
      plan.rejected.push({ row: 0, reason: `bank holiday date "${h?.date}" is not YYYY-MM-DD` });
      continue;
    }
    if (holidayDates.has(h.date)) {
      plan.holidays_unchanged += 1;
      continue;
    }
    holidayDates.add(h.date);
    plan.holidays_insert.push({ holiday_date: h.date, name: asStr(h.name) });
  }

  const patch = settingsPatch(file);
  plan.settings_changes = settingsChanges(patch, current.settings);
  plan.settings = plan.settings_changes.length ? patch : null;

  plan.counts = {
    file_rows: file.logEntries.length,
    added: plan.entries_insert.length,
    changed: plan.entries_update.length,
    unchanged: plan.unchanged,
    conflicts: plan.conflicts.length,
    skipped_deleted: plan.skipped_deleted,
    rejected: plan.rejected.length,
    absences_added: plan.absences_insert.length,
    holidays_added: plan.holidays_insert.length,
    settings_changed: plan.settings_changes.length,
  };
  return plan;
}

/** What goes to hours_apply_import(): the plan without its before-images and conflicts. */
export function planPayload(plan: ImportPlan): Record<string, unknown> {
  return {
    filename: plan.filename,
    format: plan.format,
    counts: plan.counts,
    settings: plan.settings,
    entries_insert: plan.entries_insert,
    entries_update: plan.entries_update.map((u) => ({ id: u.id, ...u.after })),
    absences_insert: plan.absences_insert,
    holidays_insert: plan.holidays_insert,
  };
}

/** The dry-run answer shown to Phil: counts and samples, before-and-after for every change. */
export function planSummary(plan: ImportPlan, sample = 20) {
  return {
    counts: plan.counts,
    added: plan.entries_insert.slice(0, sample),
    changed: plan.entries_update,
    conflicts: plan.conflicts,
    rejected: plan.rejected.slice(0, sample),
    absences_added: plan.absences_insert,
    holidays_added: plan.holidays_insert,
    settings_changes: plan.settings_changes,
    can_apply: plan.conflicts.length === 0 && plan.rejected.length === 0,
  };
}
