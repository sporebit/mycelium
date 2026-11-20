/**
 * Export (spec §6): the database is the master; a file is for evidence and
 * backup. Two shapes from the same bundle:
 *   - JSON: lossless, the seed / import shape with every entry's `id`, so a
 *     re-import upserts by id and `exportedAt` lets the planner spot a row
 *     changed here since the export (a conflict).
 *   - Sheets: plain values for the workbook tabs — Log, Absences, Bank
 *     Holidays, Settings, Weekly History. Title Case headers, dates as
 *     YYYY-MM-DD, durations as both h:mm and Minutes (import trusts Minutes).
 * Pure; the route turns the sheet rows into an .xlsx with exceljs.
 */
import { bundleTotals, buildIndex, fmtHm, historyRows, type WeekSummary } from "./calc";
import type { HoursBundle } from "./types";

export function exportJson(bundle: HoursBundle, exportedAt: string) {
  const s = bundle.settings;
  return {
    exportedAt,
    settings: s
      ? {
          contractedMinutesPerWeek: s.contracted_minutes_per_week,
          standardDayMinutes: s.standard_day_minutes,
          checkpointThresholdMinutes: s.checkpoint_threshold_minutes,
          checkpointLabel: s.checkpoint_label,
          trackingStart: s.tracking_start,
          reviewLengthWeeks: s.review_length_weeks,
          wedMinutesBefore1300: s.wed_minutes_before_1300,
          wedMinutesAfter1300: s.wed_minutes_after_1300,
          ticketBaseUrl: s.ticket_base_url,
          catchAllTickets: s.catch_all_tickets,
        }
      : null,
    blockOut: s ? { recipients: s.block_out_recipients, subjectTemplate: s.block_out_subject_template, bodyLines: s.block_out_body_lines } : null,
    absences: bundle.absences.map((a) => ({ date: a.absence_date, type: a.type, minutes: a.minutes, note: a.note })),
    bankHolidays: bundle.bankHolidays.map((h) => ({ date: h.holiday_date, name: h.name })),
    logEntries: bundle.entries
      .filter((e) => !e.deleted_at)
      .map((e) => ({
        id: e.id,
        sourceRow: e.source_row,
        date: e.entry_date,
        minutes: e.minutes,
        estimateMinutes: e.estimate_minutes,
        description: e.description,
        ticketRaw: e.ticket_raw,
        ticketKey: e.ticket_key,
        logged: e.logged,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      })),
  };
}

export type Sheet = { name: string; headers: string[]; rows: Array<Array<string | number | null>> };

const hm = (m: number | null) => (m === null ? null : fmtHm(m));

export function exportSheets(bundle: HoursBundle, today: string): Sheet[] {
  const index = buildIndex(bundle, today);
  const s = bundle.settings;
  const log: Sheet = {
    name: "Log",
    headers: ["Date", "Time Spent", "Minutes", "Estimate", "Estimate Minutes", "Description", "Ticket", "Ticket Key", "Logged", "Entry ID", "Created", "Updated"],
    rows: bundle.entries
      .filter((e) => !e.deleted_at)
      .slice()
      .sort((a, b) => (a.entry_date ?? "9999").localeCompare(b.entry_date ?? "9999") || a.created_at.localeCompare(b.created_at))
      .map((e) => [e.entry_date, hm(e.minutes), e.minutes, hm(e.estimate_minutes), e.estimate_minutes, e.description, e.ticket_raw, e.ticket_key, e.logged ? "x" : "", e.id, stamp(e.created_at), stamp(e.updated_at)]),
  };
  const absences: Sheet = {
    name: "Absences",
    headers: ["Date", "Type", "Minutes", "Note"],
    rows: bundle.absences.slice().sort((a, b) => a.absence_date.localeCompare(b.absence_date)).map((a) => [a.absence_date, a.type, a.minutes, a.note]),
  };
  const holidays: Sheet = {
    name: "Bank Holidays",
    headers: ["Date", "Name"],
    rows: bundle.bankHolidays.slice().sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)).map((h) => [h.holiday_date, h.name]),
  };
  const settings: Sheet = {
    name: "Settings",
    headers: ["Setting", "Value"],
    rows: s
      ? [
          ["Contracted Minutes Per Week", s.contracted_minutes_per_week],
          ["Contracted Per Week", fmtHm(s.contracted_minutes_per_week)],
          ["Standard Day Minutes", s.standard_day_minutes],
          ["Checkpoint Threshold Minutes", s.checkpoint_threshold_minutes],
          ["Checkpoint Label", s.checkpoint_label],
          ["Tracking Start", s.tracking_start],
          ["Review Length Weeks", s.review_length_weeks],
          ["Wed Minutes Before 1300", s.wed_minutes_before_1300],
          ["Wed Minutes After 1300", s.wed_minutes_after_1300],
          ["Ticket Base Url", s.ticket_base_url],
          ["Catch All Tickets", s.catch_all_tickets.map((t) => `${t.key}${t.purpose ? ` — ${t.purpose}` : ""}`).join("; ")],
          ["Block Out Recipients", s.block_out_recipients.join("; ")],
          ["Block Out Subject", s.block_out_subject_template],
          ["Block Out Body", s.block_out_body_lines.join("\n")],
          ["Exported", today],
        ]
      : [["Exported", today]],
  };
  const totals = bundleTotals(index);
  const history: Sheet = {
    name: "Weekly History",
    headers: ["Week Of", "Mon", "Tue", "Wed", "Thu", "Mon Thu", "Weekly Pct", "Surplus Lost", "Shortfall", "Fri Worked", "Not Yet Logged", "Status", "Banked Minutes"],
    rows: historyRows(index, today).map((w: WeekSummary) => [
      w.monday,
      fmtHm(w.days[0].total),
      fmtHm(w.days[1].total),
      fmtHm(w.days[2].total),
      fmtHm(w.days[3].total),
      fmtHm(w.banked),
      Math.round(w.weeklyPct * 1000) / 10,
      fmtHm(w.surplusLost),
      fmtHm(w.remaining),
      fmtHm(w.friWorked),
      fmtHm(w.notYetLogged),
      w.status,
      w.banked,
    ]),
  };
  history.rows.push([], ["Totals", null, null, null, null, fmtHm(totals.loggedMinutes), null, null, null, null, null, `${totals.withTime} entries · ${totals.distinctKeys} tickets`, totals.loggedMinutes]);
  return [log, absences, holidays, settings, history];
}

function stamp(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}
