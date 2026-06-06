import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  type CsvBankParser,
  type NormalizedTxn,
  stripBom,
  normalizeLines,
  normaliseTxnType,
} from "@/lib/finance/csv-parser";
import { halifaxParser } from "@/lib/finance/halifax-csv";
import { revolutParser } from "@/lib/finance/revolut-csv";
import { amexParser } from "@/lib/finance/amex-csv";
import { detectPayPal, parsePayPalCsv } from "@/lib/finance/paypal-csv";
import { findOrCreateAccount, persistPayPalImport } from "@/lib/finance/paypal-persist";
import { runPayPalMatcher, type MatchRunResult } from "@/lib/finance/paypal-match";
import type { ImportResult } from "@/lib/types/transaction";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 60;

const PARSERS: CsvBankParser[] = [halifaxParser, revolutParser, amexParser];

const EXCEL_EXTENSIONS = new Set([".xlsx", ".xls"]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function isExcel(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return EXCEL_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToString(o.result);
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    if ("text" in o) return cellToString(o.text);
    return "";
  }
  return "";
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function excelToCsv(buffer: ArrayBuffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await (workbook.xlsx.load as (data: ArrayBuffer) => Promise<unknown>)(buffer);
  const ws = workbook.worksheets[0];
  if (!ws) return "";

  const rows: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(csvEscape(cellToString(values[i])));
    }
    rows.push(cells.join(","));
  });
  return rows.join("\n");
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form with file(s)" },
      { status: 400 },
    );
  }

  const files = form.getAll("files");
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const supabase = createServerClient();
  const results: ImportResult[] = [];

  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    const fileName = entry.name;

    let text: string;
    try {
      if (isExcel(fileName)) {
        const buf = await entry.arrayBuffer();
        text = await excelToCsv(buf);
      } else {
        text = stripBom(await entry.text());
      }
    } catch (err) {
      results.push({
        file: fileName,
        imported: 0,
        skipped: 0,
        errors: [{ line: 0, raw: "", reason: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` }],
      });
      continue;
    }

    const lines = normalizeLines(text);
    if (lines.length === 0) {
      results.push({
        file: fileName,
        imported: 0,
        skipped: 0,
        errors: [{ line: 1, raw: "", reason: "Empty file" }],
      });
      continue;
    }

    const headerLine = lines[0].trim();

    // ── PayPal (custom flow — writes to paypal_payments + transactions) ──
    if (detectPayPal(headerLine)) {
      const pp = await parsePayPalCsv(text);

      if (pp.payments.length === 0 && pp.balanceFundedTxns.length === 0) {
        results.push({
          file: fileName,
          imported: 0,
          skipped: 0,
          paypal_summary: pp.summary,
          errors: pp.errors,
        });
        continue;
      }

      const persisted = await persistPayPalImport(supabase, uid, pp);
      results.push({
        file: fileName,
        imported: persisted.imported,
        skipped: persisted.skipped,
        paypal_summary: pp.summary,
        errors: [...pp.errors, ...persisted.errors],
      });
      continue;
    }

    // ── Standard parsers (Halifax, Revolut, AMEX) ──
    const parser = PARSERS.find((p) => p.detect(headerLine));
    if (!parser) {
      results.push({
        file: fileName,
        imported: 0,
        skipped: 0,
        errors: [
          {
            line: 1,
            raw: headerLine.slice(0, 200),
            reason: `Unrecognised format. Header: "${headerLine.slice(0, 100)}"`,
          },
        ],
      });
      continue;
    }

    const parsed = await parser.parse(text);

    if (parsed.txns.length === 0 && parsed.errors.length > 0) {
      results.push({
        file: fileName,
        imported: 0,
        skipped: 0,
        skipped_by_state: parsed.skipped.length || undefined,
        errors: parsed.errors,
      });
      continue;
    }

    // Resolve accounts: findOrCreate each AccountDescriptor
    const accountIdMap = new Map<string, string>();

    for (const [extKey, desc] of parsed.accounts) {
      const id = await findOrCreateAccount(supabase, uid, desc);
      if (id) {
        accountIdMap.set(extKey, id);
      } else {
        parsed.errors.push({
          line: 0,
          raw: "",
          reason: `Failed to create account ${desc.bank} ${extKey}`,
        });
      }
    }

    const insertRows = parsed.txns
      .filter((t) => accountIdMap.has(t.account_key))
      .map((t: NormalizedTxn) => ({
        user_id: uid,
        account_id: accountIdMap.get(t.account_key)!,
        txn_date: t.txn_date,
        txn_type: normaliseTxnType(t.txn_type, t.debit, t.credit),
        description: t.description,
        amount: t.amount,
        debit: t.debit,
        credit: t.credit,
        balance: t.balance,
        dedup_hash: t.dedup_hash,
        fee: t.fee,
        currency: t.currency,
        state: t.state,
        started_at: t.started_at,
        completed_at: t.completed_at,
      }));

    let imported = 0;
    const BATCH = 500;

    for (let i = 0; i < insertRows.length; i += BATCH) {
      const batch = insertRows.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("transactions")
        .upsert(batch, { onConflict: "dedup_hash", ignoreDuplicates: true })
        .select("id");
      if (error) {
        parsed.errors.push({
          line: 0,
          raw: "",
          reason: `Batch insert error: ${error.message}`,
        });
      } else {
        imported += data?.length ?? 0;
      }
    }

    const skipped = insertRows.length - imported;

    results.push({
      file: fileName,
      imported,
      skipped,
      skipped_by_state: parsed.skipped.length || undefined,
      errors: parsed.errors,
    });
  }

  // Run PayPal matcher after all imports (resolves pending payments against new statements)
  let match_result: MatchRunResult | null = null;
  try {
    match_result = await runPayPalMatcher(supabase, uid);
  } catch (err) {
    console.error("[import] PayPal matcher error:", err);
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const flatErrors: string[] = [];
  for (const r of results) {
    for (const e of r.errors) {
      flatErrors.push(`${r.file}: ${e.reason}`);
    }
  }

  return NextResponse.json({
    results,
    match_result,
    filesProcessed: results.length,
    imported: totalImported,
    duplicatesSkipped: totalSkipped,
    matched: match_result?.auto_matched ?? 0,
    errors: flatErrors,
  });
}
