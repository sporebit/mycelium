/**
 * The Friday block-out (spec §2 "Wednesday 13:00 checkpoint", O3 2026-11-19):
 * a mailto link built fresh each time and a downloadable .ics for the
 * calendar entry. Nothing is sent by Mycelium. The workbook drove desktop
 * Outlook with a macro; here the person's own mail client and calendar take
 * over from the link and the file.
 *
 * The subject template may carry `{dd/mm/yyyy}` (the workbook's token),
 * `{date}` (the same) or `{d Mon}`; each becomes the Friday's date.
 */
import { addDays, weekdayIndex, WEEKDAY_SHORT } from "./calc";

export type BlockOutSettings = {
  block_out_recipients: string[];
  block_out_subject_template: string;
  block_out_body_lines: string[];
};

/** The Friday of the week `anyDay` falls in. */
export function fridayOf(anyDay: string): string {
  return addDays(anyDay, 4 - weekdayIndex(anyDay));
}

function ddmmyyyy(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function dMon(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayIndex(key)]} ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

export function fillTemplate(template: string, friday: string): string {
  return template.replace(/\{dd\/mm\/yyyy\}/gi, ddmmyyyy(friday)).replace(/\{date\}/gi, ddmmyyyy(friday)).replace(/\{d mon\}/gi, dMon(friday));
}

export type BlockOut = { friday: string; to: string[]; subject: string; body: string; mailto: string };

export function buildBlockOut(s: BlockOutSettings, anyDayInWeek: string): BlockOut {
  const friday = fridayOf(anyDayInWeek);
  const to = s.block_out_recipients.map((r) => r.trim()).filter(Boolean);
  const subject = fillTemplate(s.block_out_subject_template, friday);
  const body = s.block_out_body_lines.map((l) => fillTemplate(l, friday)).join("\n");
  const mailto = `mailto:${to.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { friday, to, subject, body, mailto };
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets as RFC 5545 asks (ASCII-only content here, so bytes = chars). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * An all-day event on the Friday, marked free (TRANSP:TRANSPARENT is the
 * iCalendar way to say "shown but not busy"), with the block-out text as the
 * description. `stamp` is the generation time; `uid` is stable per Friday so
 * re-downloading replaces rather than duplicates.
 */
export function buildBlockOutIcs(b: BlockOut, stamp: Date = new Date()): string {
  const dt = b.friday.replace(/-/g, "");
  const end = addDays(b.friday, 1).replace(/-/g, "");
  const now = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mycelium//Hours//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:hours-blockout-${b.friday}@mycelium`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsEscape(b.subject || "Friday off")}`,
    `DESCRIPTION:${icsEscape(b.body)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
