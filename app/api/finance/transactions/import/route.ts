import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  type CsvBankParser,
  type NormalizedTxn,
  stripBom,
  normalizeLines,
} from "@/lib/finance/csv-parser";
import { halifaxParser } from "@/lib/finance/halifax-csv";
import { revolutParser } from "@/lib/finance/revolut-csv";
import { amexParser } from "@/lib/finance/amex-csv";
import { detectPayPal, parsePayPalCsv } from "@/lib/finance/paypal-csv";
import type { ImportResult } from "@/lib/types/transaction";

export const runtime = "nodejs";
export const maxDuration = 60;

const PARSERS: CsvBankParser[] = [halifaxParser, revolutParser, amexParser];

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function findOrCreateAccount(
  supabase: ReturnType<typeof createServerClient>,
  uid: string,
  desc: { bank: string; external_key: string; label: string; account_type: string; account_number?: string | null; sort_code?: string | null },
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("user_id", uid)
    .eq("bank", desc.bank)
    .eq("external_key", desc.external_key)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: uid,
      bank: desc.bank,
      external_key: desc.external_key,
      label: desc.label,
      account_type: desc.account_type,
      account_number: desc.account_number ?? null,
      sort_code: desc.sort_code ?? null,
    })
    .select("id")
    .single();

  if (createErr || !created) {
    const { data: retry } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("user_id", uid)
      .eq("bank", desc.bank)
      .eq("external_key", desc.external_key)
      .single();
    return retry?.id ?? null;
  }

  return created.id;
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
      { error: "Expected multipart form with CSV file(s)" },
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
    const text = stripBom(await entry.text());

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

      const accountId = await findOrCreateAccount(supabase, uid, pp.account);
      if (!accountId) {
        results.push({
          file: fileName,
          imported: 0,
          skipped: 0,
          errors: [
            ...pp.errors,
            { line: 0, raw: "", reason: "Failed to create PayPal bank account" },
          ],
        });
        continue;
      }

      // Upsert payment legs into paypal_payments
      const paymentDbRows = pp.payments.map((p) => ({
        user_id: uid,
        transaction_id: p.transaction_id,
        ref_txn_id: p.ref_txn_id,
        paypal_date: p.paypal_date,
        merchant_name: p.merchant_name,
        description: p.description,
        currency: p.currency,
        gross: p.gross,
        fee: p.fee,
        net: p.net,
        amount: p.amount,
        funded: p.funded,
        funding_type: p.funding_type,
        match_status: p.match_status,
      }));

      const BATCH = 500;
      for (let i = 0; i < paymentDbRows.length; i += BATCH) {
        const batch = paymentDbRows.slice(i, i + BATCH);
        const { error } = await supabase
          .from("paypal_payments")
          .upsert(batch, {
            onConflict: "transaction_id",
            ignoreDuplicates: true,
          });
        if (error) {
          pp.errors.push({
            line: 0,
            raw: "",
            reason: `PayPal payments batch error: ${error.message}`,
          });
        }
      }

      // Insert balance-funded transactions into transactions table
      const txnRows = pp.balanceFundedTxns.map((t) => ({
        user_id: uid,
        account_id: accountId,
        txn_date: t.txn_date,
        txn_type: t.txn_type,
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
      for (let i = 0; i < txnRows.length; i += BATCH) {
        const batch = txnRows.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("transactions")
          .upsert(batch, { onConflict: "dedup_hash", ignoreDuplicates: true })
          .select("id");
        if (error) {
          pp.errors.push({
            line: 0,
            raw: "",
            reason: `Transactions batch error: ${error.message}`,
          });
        } else {
          imported += data?.length ?? 0;
        }
      }

      results.push({
        file: fileName,
        imported,
        skipped: txnRows.length - imported,
        paypal_summary: pp.summary,
        errors: pp.errors,
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
            reason: `Unrecognised CSV format. Header: "${headerLine.slice(0, 100)}"`,
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
        txn_type: t.txn_type,
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

  return NextResponse.json({ results });
}
