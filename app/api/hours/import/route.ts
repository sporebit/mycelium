import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createUserClient } from "@/lib/supabase/user";
import { ImportFileError, planImport, planPayload, planSummary, readImportFile, type Current, type ImportFile } from "@/lib/hours/import";
import { readPaste, readTable, type Cell } from "@/lib/hours/paste";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, IMPORT_RUN_SELECT, SETTINGS_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const FORMATS = new Set(["json", "xlsx", "paste"]);
const MAX_XLSX_BYTES = 8 * 1024 * 1024;

/**
 * /api/hours/import (spec §6).
 *
 * GET   the last ten import runs (newest first) and whether the latest can
 *       still be undone.
 * POST  { file | paste | xlsx, filename?, format?, dryRun?, resolutions? }
 *       `file` is the seed / backup shape ({ logEntries, absences?, … });
 *       `paste` is the workbook's Log columns as copied text; `xlsx` is a
 *       base64 workbook whose Log sheet (or first sheet) carries them. All
 *       three become the same ImportFile for the same planner. dryRun
 *       (default true) answers the plan: added / changed / unchanged /
 *       conflicts with before-and-after, and never writes. dryRun:false
 *       re-plans against the live rows and applies the plan in one
 *       transaction through hours_apply_import() (0156), which records the
 *       run and what undoes it. Refused while conflicts or rejected rows
 *       remain. The seed's first load went through here (scripts/hours-import.mjs).
 */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("hours_import_runs").select(IMPORT_RUN_SELECT).order("ran_at", { ascending: false }).limit(10);
    if (error) throw error;
    const runs = data ?? [];
    const latest = runs[0] as { undone_at: string | null } | undefined;
    return NextResponse.json({ runs, can_undo: !!latest && latest.undone_at === null });
  } catch (err) {
    console.error("[/api/hours/import GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

async function loadCurrent(supabase: Awaited<ReturnType<typeof createUserClient>>): Promise<Current> {
  const [settings, entries, absences, holidays] = await Promise.all([
    supabase.from("hours_settings").select(SETTINGS_SELECT).maybeSingle(),
    supabase.from("hours_entries").select(ENTRY_SELECT),
    supabase.from("hours_absences").select(ABSENCE_SELECT),
    supabase.from("hours_bank_holidays").select(HOLIDAY_SELECT),
  ]);
  for (const r of [settings, entries, absences, holidays]) if (r.error) throw r.error;
  return {
    settings: (settings.data as Current["settings"]) ?? null,
    entries: (entries.data ?? []) as unknown as Current["entries"],
    absences: (absences.data ?? []) as unknown as Current["absences"],
    bankHolidays: (holidays.data ?? []) as unknown as Current["bankHolidays"],
  };
}

/** exceljs cell values → plain cells the table reader understands. */
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
  }
  return String(v);
}

async function readXlsx(base64: string): Promise<{ file: ImportFile; rejected: Array<{ row: number; reason: string }> }> {
  const buf = Buffer.from(base64, "base64");
  if (buf.byteLength === 0 || buf.byteLength > MAX_XLSX_BYTES) throw new ImportFileError("The workbook is empty or over 8 MB.");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Log") ?? wb.worksheets[0];
  if (!ws) throw new ImportFileError("The workbook has no sheets.");
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const cells: Cell[] = [];
    const values = row.values as ExcelJS.CellValue[]; // 1-based
    for (let c = 1; c < values.length; c++) cells.push(cellValue(values[c]));
    rows[n - 1] = cells;
  });
  const read = readTable(rows.map((r) => r ?? []));
  return { file: read.file, rejected: read.rejected };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { file?: unknown; paste?: unknown; xlsx?: unknown; filename?: unknown; format?: unknown; dryRun?: unknown; resolutions?: unknown }
    | null;
  if (!body || (body.file === undefined && body.paste === undefined && body.xlsx === undefined)) {
    return NextResponse.json({ error: "Send { file } (JSON), { paste } (workbook columns as text) or { xlsx } (base64)." }, { status: 400 });
  }
  const filename = typeof body.filename === "string" ? body.filename.slice(0, 200) : "";
  let format = typeof body.format === "string" && FORMATS.has(body.format) ? (body.format as "json" | "xlsx" | "paste") : "json";
  let file: ImportFile;
  let tableRejected: Array<{ row: number; reason: string }> = [];
  try {
    if (typeof body.paste === "string") {
      format = "paste";
      const read = readPaste(body.paste.slice(0, 2_000_000));
      file = read.file;
      tableRejected = read.rejected;
    } else if (typeof body.xlsx === "string") {
      format = "xlsx";
      const read = await readXlsx(body.xlsx);
      file = read.file;
      tableRejected = read.rejected;
    } else {
      file = readImportFile(body.file);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof ImportFileError ? e.message : "unreadable file" }, { status: 400 });
  }
  if (file.logEntries.length === 0 && tableRejected.length === 0) {
    return NextResponse.json({ error: "No entries found." }, { status: 400 });
  }
  const dryRun = body.dryRun !== false;
  const resolutions: Record<string, "file" | "db"> = {};
  if (body.resolutions && typeof body.resolutions === "object") {
    for (const [k, v] of Object.entries(body.resolutions as Record<string, unknown>)) if (v === "file" || v === "db") resolutions[k] = v;
  }
  try {
    const supabase = await createUserClient();
    const current = await loadCurrent(supabase);
    const plan = planImport(file, current, { filename, format, resolutions });
    if (tableRejected.length) {
      plan.rejected = [...tableRejected, ...plan.rejected].sort((a, b) => a.row - b.row);
      plan.counts = { ...plan.counts, rejected: plan.rejected.length };
    }
    const summary = planSummary(plan);
    if (dryRun) return NextResponse.json({ dry_run: true, ...summary });
    if (!summary.can_apply) {
      return NextResponse.json({ error: "Resolve the conflicts and fix the rejected rows first.", dry_run: false, ...summary }, { status: 409 });
    }
    const { data, error } = await supabase.rpc("hours_apply_import", { p_plan: planPayload(plan) });
    if (error) throw error;
    return NextResponse.json({ dry_run: false, applied: data, ...summary });
  } catch (err) {
    console.error("[/api/hours/import POST]", err);
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
