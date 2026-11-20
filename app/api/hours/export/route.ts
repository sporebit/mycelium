import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createUserClient } from "@/lib/supabase/user";
import { localDateKey } from "@/lib/util/date";
import { exportJson, exportSheets } from "@/lib/hours/export";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, SETTINGS_SELECT, type HoursBundle } from "@/lib/hours/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/hours/export?format=json|xlsx (spec §6). JSON is the lossless
 * backup in the import shape (ids included, so it re-imports as an upsert);
 * xlsx is the workbook view: Log, Absences, Bank Holidays, Settings, Weekly
 * History, plain values. Both are attachments named by the day.
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "json";
  try {
    const supabase = await createUserClient();
    const [settings, entries, absences, holidays] = await Promise.all([
      supabase.from("hours_settings").select(SETTINGS_SELECT).maybeSingle(),
      supabase.from("hours_entries").select(ENTRY_SELECT).is("deleted_at", null).order("entry_date", { ascending: true, nullsFirst: false }).order("created_at"),
      supabase.from("hours_absences").select(ABSENCE_SELECT).order("absence_date"),
      supabase.from("hours_bank_holidays").select(HOLIDAY_SELECT).order("holiday_date"),
    ]);
    for (const r of [settings, entries, absences, holidays]) if (r.error) throw r.error;
    const bundle: HoursBundle = {
      settings: (settings.data as HoursBundle["settings"]) ?? null,
      entries: (entries.data ?? []) as unknown as HoursBundle["entries"],
      absences: (absences.data ?? []) as unknown as HoursBundle["absences"],
      bankHolidays: (holidays.data ?? []) as unknown as HoursBundle["bankHolidays"],
    };
    const today = localDateKey();
    if (format === "json") {
      const body = JSON.stringify(exportJson(bundle, new Date().toISOString()), null, 2);
      return new NextResponse(body, {
        headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="hours-${today}.json"`, "cache-control": "no-store" },
      });
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "Mycelium";
    wb.created = new Date();
    for (const sheet of exportSheets(bundle, today)) {
      const ws = wb.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.addRow(sheet.headers).font = { bold: true };
      for (const row of sheet.rows) ws.addRow(row);
      ws.columns.forEach((col, i) => {
        let width = sheet.headers[i]?.length ?? 8;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const len = String(cell.value ?? "").length;
          if (len > width) width = len;
        });
        col.width = Math.min(60, Math.max(8, width + 2));
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="hours-${today}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/hours/export GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
