/**
 * The workbook's Log columns as a paste or an .xlsx (spec §6 "Parallel run",
 * D4): while the workbook is still the record, a week of its entries comes
 * across without retyping. Columns by header, in any order: Date, Time Spent,
 * Estimate, Description, Ticket, Logged (`x`); the export's extra columns
 * (Minutes, Estimate Minutes, Entry ID, Ticket Key) are understood too, so
 * an exported sheet round-trips. Without a header row the workbook order is
 * assumed. The result is an ImportFile for the same planner as JSON, so the
 * dry run, conflicts and undo all apply.
 */
import { isDateKey, parseDuration } from "./calc";
import type { FileEntry, ImportFile } from "./import";

export type Cell = string | number | boolean | Date | null | undefined;

const WORKBOOK_ORDER = ["date", "time spent", "estimate", "description", "ticket", "logged"] as const;

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  day: "date",
  "time spent": "time",
  time: "time",
  duration: "time",
  hours: "time",
  minutes: "minutes",
  mins: "minutes",
  estimate: "estimate",
  est: "estimate",
  "estimate minutes": "estimate_minutes",
  description: "description",
  desc: "description",
  what: "description",
  ticket: "ticket",
  key: "ticket",
  "ticket key": "ticket_key",
  logged: "logged",
  "in jira": "logged",
  jira: "logged",
  "entry id": "id",
  id: "id",
  "source row": "source_row",
  row: "source_row",
};

export function normaliseHeader(h: Cell): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** True when the row reads as the workbook's header line. */
export function looksLikeHeader(row: Cell[]): boolean {
  const names = row.map(normaliseHeader).filter(Boolean);
  if (names.length === 0) return false;
  const known = names.filter((n) => n in HEADER_ALIASES).length;
  return known >= 2 && names.includes("date");
}

/** `2026-11-19`, `19/11/2026`, `19/11/26`, `19-11-2026`, `19 Nov 2026`, an Excel serial, or a Date. Null when empty, undefined when unreadable. */
export function readDate(v: Cell): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return undefined;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  // isDateKey is a type guard; checking an `unknown` copy keeps `t` a string below
  const asUnknown: unknown = t;
  if (isDateKey(asUnknown)) return t;
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const key = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isDateKey(key) ? key : undefined;
  }
  m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) {
    const key = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isDateKey(key) ? key : undefined;
  }
  const parsed = Date.parse(`${t} UTC`);
  if (!Number.isNaN(parsed) && /[a-z]/i.test(t)) return new Date(parsed).toISOString().slice(0, 10);
  return undefined;
}

/** Minutes from `h:mm`, decimal hours, an Excel time fraction (< 1 → hours of a day), or empty. Undefined when unreadable. */
export function readDurationCell(v: Cell): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return undefined;
  if (v instanceof Date) {
    // Excel keeps a bare time as a Date on 1899-12-30 (or 1899-12-31 via some readers)
    const m = v.getUTCHours() * 60 + v.getUTCMinutes();
    return m >= 0 && m <= 1440 ? m : undefined;
  }
  if (typeof v === "number") {
    if (v > 0 && v < 1) return Math.round(v * 1440);
    if (Number.isInteger(v) && v >= 0 && v <= 1440) return v;
    return undefined;
  }
  const n = parseDuration(String(v));
  return n === null ? undefined : n;
}

export function readLogged(v: Cell): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  const t = String(v ?? "")
    .trim()
    .toLowerCase();
  return t === "x" || t === "yes" || t === "y" || t === "true" || t === "1" || t === "✓";
}

export type TableRead = { file: ImportFile; rejected: Array<{ row: number; reason: string }>; columns: string[] };

/**
 * Rows (header first when present) → ImportFile. Row numbers in `rejected`
 * are 1-based positions in the pasted text or sheet, so a person can find
 * them. Blank rows are skipped.
 */
export function readTable(rows: Cell[][]): TableRead {
  const rejected: Array<{ row: number; reason: string }> = [];
  let start = 0;
  let columns: string[];
  if (rows.length && looksLikeHeader(rows[0])) {
    columns = rows[0].map((h) => HEADER_ALIASES[normaliseHeader(h)] ?? "");
    start = 1;
  } else {
    columns = WORKBOOK_ORDER.map((h) => HEADER_ALIASES[h]);
  }
  const col = (name: string) => columns.indexOf(name);
  const iDate = col("date");
  const iTime = col("time");
  const iMinutes = col("minutes");
  const iEst = col("estimate");
  const iEstMin = col("estimate_minutes");
  const iDesc = col("description");
  const iTicket = col("ticket");
  const iLogged = col("logged");
  const iId = col("id");
  const iRow = col("source_row");
  if (iDate < 0 || (iTime < 0 && iMinutes < 0) || iDesc < 0) {
    return { file: { logEntries: [] }, rejected: [{ row: 1, reason: "Need at least Date, Time Spent and Description columns." }], columns };
  }
  const entries: FileEntry[] = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const n = r + 1;
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const date = readDate(row[iDate]);
    if (date === undefined) {
      rejected.push({ row: n, reason: `Date "${String(row[iDate])}" not understood.` });
      continue;
    }
    let minutes: number | null | undefined = iMinutes >= 0 ? readDurationCell(row[iMinutes]) : null;
    if ((minutes === null || minutes === undefined) && iTime >= 0) minutes = readDurationCell(row[iTime]);
    if (minutes === undefined) {
      rejected.push({ row: n, reason: `Time Spent "${String(row[iTime >= 0 ? iTime : iMinutes])}" not understood.` });
      continue;
    }
    let estimate: number | null | undefined = iEstMin >= 0 ? readDurationCell(row[iEstMin]) : null;
    if ((estimate === null || estimate === undefined) && iEst >= 0) estimate = readDurationCell(row[iEst]);
    if (estimate === undefined) {
      rejected.push({ row: n, reason: `Estimate "${String(row[iEst >= 0 ? iEst : iEstMin])}" not understood.` });
      continue;
    }
    const description = String(row[iDesc] ?? "").trim();
    const ticketRaw = iTicket >= 0 ? String(row[iTicket] ?? "").trim() : "";
    if (minutes === null && !description && !ticketRaw) {
      rejected.push({ row: n, reason: "No time, description or ticket." });
      continue;
    }
    const idCell = iId >= 0 ? String(row[iId] ?? "").trim() : "";
    const srcCell = iRow >= 0 ? row[iRow] : null;
    const sourceRow = typeof srcCell === "number" && Number.isInteger(srcCell) ? srcCell : typeof srcCell === "string" && /^\d+$/.test(srcCell.trim()) ? Number(srcCell) : null;
    entries.push({
      id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idCell) ? idCell : null,
      sourceRow,
      date,
      minutes,
      estimateMinutes: estimate,
      description,
      ticketRaw,
      logged: iLogged >= 0 ? readLogged(row[iLogged]) : false,
    });
  }
  return { file: { logEntries: entries }, rejected, columns };
}

/** Split pasted text (Excel copies as tab-separated; a CSV export uses commas) into cells. */
export function splitPaste(text: string): Cell[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tabbed = lines.some((l) => l.includes("\t"));
  return lines.filter((l) => l.trim() !== "").map((l) => (tabbed ? l.split("\t") : splitCsvLine(l)).map((c) => c.trim()));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function readPaste(text: string): TableRead {
  return readTable(splitPaste(text));
}
