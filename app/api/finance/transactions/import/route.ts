import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseHalifaxCsv, type ParsedRow } from "@/lib/finance/halifax-csv";
import type { ImportResult } from "@/lib/types/transaction";

export const runtime = "nodejs";
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
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
    const text = await entry.text();
    const parsed = await parseHalifaxCsv(text);

    if (parsed.rows.length === 0) {
      results.push({
        file: fileName,
        imported: 0,
        skipped: 0,
        errors: parsed.errors,
      });
      continue;
    }

    // Group rows by account_number to upsert bank_accounts.
    const accountNumbers = [...new Set(parsed.rows.map((r) => r.account_number))];
    const accountIdMap = new Map<string, string>();

    for (const acctNum of accountNumbers) {
      const sample = parsed.rows.find((r) => r.account_number === acctNum)!;
      const last4 = acctNum.slice(-4);
      const defaultLabel = `Halifax ••${last4}`;

      // Try to find existing account first.
      const { data: existing } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("user_id", uid)
        .eq("account_number", acctNum)
        .maybeSingle();

      if (existing) {
        accountIdMap.set(acctNum, existing.id);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("bank_accounts")
          .insert({
            user_id: uid,
            bank: "Halifax",
            account_number: acctNum,
            sort_code: sample.sort_code || null,
            label: defaultLabel,
          })
          .select("id")
          .single();
        if (createErr || !created) {
          // Might be a race — try select again.
          const { data: retry } = await supabase
            .from("bank_accounts")
            .select("id")
            .eq("user_id", uid)
            .eq("account_number", acctNum)
            .single();
          if (retry) {
            accountIdMap.set(acctNum, retry.id);
          } else {
            parsed.errors.push({
              line: 0,
              raw: "",
              reason: `Failed to create bank account for ${acctNum}: ${createErr?.message}`,
            });
            continue;
          }
        } else {
          accountIdMap.set(acctNum, created.id);
        }
      }
    }

    // Build insert rows, skipping any whose account wasn't resolved.
    const insertRows = parsed.rows
      .filter((r) => accountIdMap.has(r.account_number))
      .map((r: ParsedRow) => ({
        user_id: uid,
        account_id: accountIdMap.get(r.account_number)!,
        txn_date: r.txn_date,
        txn_type: r.txn_type,
        description: r.description,
        amount: r.amount,
        debit: r.debit,
        credit: r.credit,
        balance: r.balance,
        dedup_hash: r.dedup_hash,
      }));

    // Batch insert with ON CONFLICT DO NOTHING for dedup.
    // Supabase JS client supports `onConflict` + `ignoreDuplicates`.
    let imported = 0;
    let skipped = 0;
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

    skipped = insertRows.length - imported;

    results.push({
      file: fileName,
      imported,
      skipped,
      errors: parsed.errors,
    });
  }

  return NextResponse.json({ results });
}
