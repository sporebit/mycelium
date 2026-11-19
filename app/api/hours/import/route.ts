import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { ImportFileError, planImport, planPayload, planSummary, readImportFile, type Current } from "@/lib/hours/import";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, IMPORT_RUN_SELECT, SETTINGS_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const FORMATS = new Set(["json", "xlsx", "paste"]);

/**
 * /api/hours/import (spec §6).
 *
 * GET   the last ten import runs (newest first) and whether the latest can
 *       still be undone.
 * POST  { file, filename?, format?, dryRun?, resolutions? }
 *       `file` is the seed / backup shape ({ logEntries, absences?, … }).
 *       dryRun (default true) answers the plan: added / changed / unchanged /
 *       conflicts with before-and-after, and never writes. dryRun:false
 *       re-plans against the live rows and applies the plan in one
 *       transaction through hours_apply_import() (0156), which records the
 *       run and what undoes it. Refused while conflicts or rejected rows
 *       remain. The seed's first load goes through here (scripts/hours-import.mjs).
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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { file?: unknown; filename?: unknown; format?: unknown; dryRun?: unknown; resolutions?: unknown }
    | null;
  if (!body || body.file === undefined) return NextResponse.json({ error: "Send { file, dryRun? }." }, { status: 400 });
  let file;
  try {
    file = readImportFile(body.file);
  } catch (e) {
    return NextResponse.json({ error: e instanceof ImportFileError ? e.message : "unreadable file" }, { status: 400 });
  }
  const filename = typeof body.filename === "string" ? body.filename.slice(0, 200) : "";
  const format = typeof body.format === "string" && FORMATS.has(body.format) ? (body.format as "json" | "xlsx" | "paste") : "json";
  const dryRun = body.dryRun !== false;
  const resolutions: Record<string, "file" | "db"> = {};
  if (body.resolutions && typeof body.resolutions === "object") {
    for (const [k, v] of Object.entries(body.resolutions as Record<string, unknown>)) if (v === "file" || v === "db") resolutions[k] = v;
  }
  try {
    const supabase = await createUserClient();
    const current = await loadCurrent(supabase);
    const plan = planImport(file, current, { filename, format, resolutions });
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
