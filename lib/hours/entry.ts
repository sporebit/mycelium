/**
 * Reading a Log entry as a person typed it (spec §5 "fast add, inline
 * edit"), for POST /api/hours/entries and PATCH /api/hours/entries/[id].
 * One reader for both: a create must produce every column, a patch only the
 * ones sent. Pure, so the same rules are unit-tested and reused by the
 * paste importer.
 *
 * Rules (spec §4 validation, §3 entry state):
 *   - Time Spent and Estimate are 0–24 h; typed text goes through
 *     parseDuration (`0:45`, `45`, `1.5h`), numbers are minutes.
 *   - The date is a `YYYY-MM-DD` key or null (an open backlog item may have
 *     no date).
 *   - `ticket_key` is never sent by a client: it is derived from `ticket_raw`.
 *   - A row with no time, no description and no ticket is nothing: rejected.
 */
import { isDateKey, parseDuration } from "./calc";
import { keyFor } from "./ticket";

export type EntryWrite = {
  entry_date: string | null;
  minutes: number | null;
  estimate_minutes: number | null;
  description: string;
  ticket_raw: string;
  ticket_key: string | null;
  logged: boolean;
};

export type EntryRead = { ok: true; fields: Partial<EntryWrite> } | { ok: false; error: string };

const MAX_DESCRIPTION = 2000;
const MAX_TICKET = 500;

/** Minutes from a number, a duration string, or null/empty. `undefined` = unreadable. */
export function readMinutes(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 1440 ? v : undefined;
  if (typeof v === "string") {
    const n = parseDuration(v);
    return n === null ? undefined : n;
  }
  return undefined;
}

/**
 * Read a request body. `mode: "create"` fills defaults for anything not sent
 * and insists the row is not empty; `"patch"` returns only the keys present.
 */
export function readEntryInput(body: unknown, mode: "create" | "patch"): EntryRead {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  const out: Partial<EntryWrite> = {};

  if ("entry_date" in b) {
    const d = b.entry_date;
    if (d === null || d === "") out.entry_date = null;
    else if (isDateKey(d)) out.entry_date = d;
    else return { ok: false, error: "Date must be YYYY-MM-DD." };
  }
  if ("minutes" in b) {
    const m = readMinutes(b.minutes);
    if (m === undefined) return { ok: false, error: "Time Spent must be between 0:00 and 24:00 (e.g. 0:45, 45, 1.5h)." };
    out.minutes = m;
  }
  if ("estimate_minutes" in b) {
    const m = readMinutes(b.estimate_minutes);
    if (m === undefined) return { ok: false, error: "Estimate must be between 0:00 and 24:00." };
    out.estimate_minutes = m;
  }
  if ("description" in b) {
    if (b.description !== null && typeof b.description !== "string") return { ok: false, error: "Description must be text." };
    out.description = ((b.description as string | null) ?? "").trim().slice(0, MAX_DESCRIPTION);
  }
  if ("ticket_raw" in b || "ticket" in b) {
    const t = "ticket_raw" in b ? b.ticket_raw : b.ticket;
    if (t !== null && typeof t !== "string") return { ok: false, error: "Ticket must be text." };
    out.ticket_raw = ((t as string | null) ?? "").trim().slice(0, MAX_TICKET);
    out.ticket_key = keyFor(out.ticket_raw);
  }
  if ("logged" in b) {
    if (typeof b.logged !== "boolean") return { ok: false, error: "Logged must be true or false." };
    out.logged = b.logged;
  }

  if (mode === "create") {
    const full: EntryWrite = {
      entry_date: out.entry_date ?? null,
      minutes: out.minutes ?? null,
      estimate_minutes: out.estimate_minutes ?? null,
      description: out.description ?? "",
      ticket_raw: out.ticket_raw ?? "",
      ticket_key: out.ticket_key ?? null,
      logged: out.logged ?? false,
    };
    if (full.minutes === null && full.description === "" && full.ticket_raw === "") {
      return { ok: false, error: "An entry needs a time, a description or a ticket." };
    }
    return { ok: true, fields: full };
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nothing to change." };
  return { ok: true, fields: out };
}

/** The date a new entry defaults to: the date of the entry made most recently, else today (spec §4). */
export function defaultEntryDate(entries: Array<{ entry_date: string | null; created_at: string; deleted_at: string | null }>, today: string): string {
  let best: { created_at: string; date: string } | null = null;
  for (const e of entries) {
    if (e.deleted_at || !e.entry_date) continue;
    if (!best || e.created_at > best.created_at) best = { created_at: e.created_at, date: e.entry_date };
  }
  return best?.date ?? today;
}
