/**
 * Column sort and per-column filter for every hours table (Phil, 2026-11-20:
 * "sort on the column headers… a filter per column on all pages"). Pure:
 * the views describe their columns, this orders and narrows the rows.
 *
 * Filter grammar, per column kind:
 *   text / date   case-insensitive substring of the displayed text
 *   duration      `>1:00`, `<=45`, `=0`, `!=0:30` compare in minutes (any
 *                 parseDuration form); without an operator, substring of h:mm
 *   pct           `>50`, `<=100` compare in percent; else substring
 *   number        `>2`, `=0`; else substring
 *   bool          yes / y / x / true / 1 → ticked; no / n / false / 0 / - → not
 *   any           `blank` (or `-` alone) matches an empty cell
 */
import { fmtHm, fmtPct, parseDuration } from "./calc";

export type CellKind = "text" | "date" | "number" | "duration" | "pct" | "bool";

export type ColumnDef<R> = {
  key: string;
  label: string;
  kind: CellKind;
  /** the sortable, comparable value; null = empty cell */
  get: (row: R) => string | number | boolean | null;
  /** what the cell shows, for substring filters; defaults by kind */
  text?: (row: R) => string;
  align?: "left" | "right";
  sortable?: boolean;
  filterable?: boolean;
};

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
export type Filters = Record<string, string>;

/** Header click: a new column starts with its natural order (numbers largest first), the same column flips, a third click clears. */
export function nextSort<R>(sort: SortState, col: ColumnDef<R>): SortState {
  const natural: SortDir = col.kind === "number" || col.kind === "duration" || col.kind === "pct" || col.kind === "bool" ? "desc" : "asc";
  if (!sort || sort.key !== col.key) return { key: col.key, dir: natural };
  if (sort.dir === natural) return { key: col.key, dir: natural === "asc" ? "desc" : "asc" };
  return null;
}

export function cellText<R>(col: ColumnDef<R>, row: R): string {
  if (col.text) return col.text(row);
  const v = col.get(row);
  if (v === null || v === undefined) return "";
  switch (col.kind) {
    case "duration":
      return typeof v === "number" ? fmtHm(v) : String(v);
    case "pct":
      return typeof v === "number" ? fmtPct(v) : String(v);
    case "bool":
      return v ? "yes" : "no";
    default:
      return String(v);
  }
}

/** Nulls last whichever direction; numbers numerically; booleans ticked first; strings by locale. */
export function compareValues(a: string | number | boolean | null, b: string | number | boolean | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b), "en-GB", { numeric: true, sensitivity: "base" });
}

const OP = /^(>=|<=|!=|=|>|<)\s*(.*)$/;

function parseRhs(kind: CellKind, s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  if (kind === "duration") {
    const m = parseDuration(t);
    if (m !== null) return m;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t.replace(/%$/, ""));
  if (!Number.isFinite(n)) return null;
  return kind === "pct" ? n / 100 : n;
}

function compareOp(op: string, v: number, rhs: number): boolean {
  const eps = 1e-9;
  switch (op) {
    case ">":
      return v > rhs + eps;
    case "<":
      return v < rhs - eps;
    case ">=":
      return v >= rhs - eps;
    case "<=":
      return v <= rhs + eps;
    case "=":
      return Math.abs(v - rhs) < eps;
    case "!=":
      return Math.abs(v - rhs) >= eps;
  }
  return true;
}

export function matchFilter<R>(col: ColumnDef<R>, row: R, filter: string): boolean {
  const f = filter.trim();
  if (f === "") return true;
  const v = col.get(row);
  const lower = f.toLowerCase();
  if (lower === "blank" || f === "-") return v === null || v === "" || (typeof v === "boolean" && !v);
  if (v === null) return false;
  if (col.kind === "bool") {
    if (["yes", "y", "x", "true", "1", "ticked", "logged"].includes(lower)) return v === true;
    if (["no", "n", "false", "0", "unticked", "not"].includes(lower)) return v === false;
    return true;
  }
  if (col.kind === "number" || col.kind === "duration" || col.kind === "pct") {
    const m = OP.exec(f);
    if (m && typeof v === "number") {
      const rhs = parseRhs(col.kind, m[2]);
      if (rhs === null) return true; // operator typed, number not yet: show everything
      return compareOp(m[1], v, rhs);
    }
    if (!m && col.kind === "duration" && typeof v === "number") {
      // "1:" or "0:4" style partial typing matches the shown h:mm; a bare number also matches the minutes value
      const shown = fmtHm(v).toLowerCase();
      return shown.includes(lower) || String(v).includes(lower);
    }
  }
  return cellText(col, row).toLowerCase().includes(lower);
}

export function applyTable<R>(rows: R[], columns: ColumnDef<R>[], sort: SortState, filters: Filters): R[] {
  const active = columns.filter((c) => (filters[c.key] ?? "").trim() !== "" && c.filterable !== false);
  let out = active.length ? rows.filter((r) => active.every((c) => matchFilter(c, r, filters[c.key]))) : rows.slice();
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = out
        .map((r, i) => ({ r, i }))
        .sort((x, y) => {
          const c = compareValues(col.get(x.r), col.get(y.r));
          // nulls stay last in both directions; otherwise honour the direction; stable on ties
          if (c === 0) return x.i - y.i;
          const xn = col.get(x.r) === null;
          const yn = col.get(y.r) === null;
          if (xn !== yn) return xn ? 1 : -1;
          return c * dir;
        })
        .map((x) => x.r);
    }
  }
  return out;
}

export function activeFilterCount(columns: Array<{ key: string }>, filters: Filters): number {
  return columns.filter((c) => (filters[c.key] ?? "").trim() !== "").length;
}
