import { createServerClient } from "@/lib/supabase/server";
import type { NormalizedTxn, ParseError } from "./csv-parser";
import type { PayPalImportResult } from "./paypal-csv";

type Supabase = ReturnType<typeof createServerClient>;

export async function findOrCreateAccount(
  supabase: Supabase,
  uid: string,
  desc: {
    bank: string;
    external_key: string;
    label: string;
    account_type: string;
    account_number?: string | null;
    sort_code?: string | null;
  },
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

export type PersistResult = {
  imported: number;
  skipped: number;
  errors: ParseError[];
};

export async function persistPayPalImport(
  supabase: Supabase,
  uid: string,
  pp: PayPalImportResult,
): Promise<PersistResult> {
  const errors: ParseError[] = [...pp.errors];

  const accountId = await findOrCreateAccount(supabase, uid, pp.account);
  if (!accountId) {
    return {
      imported: 0,
      skipped: 0,
      errors: [...errors, { line: 0, raw: "", reason: "Failed to create PayPal bank account" }],
    };
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
      .upsert(batch, { onConflict: "transaction_id", ignoreDuplicates: true });
    if (error) {
      errors.push({ line: 0, raw: "", reason: `PayPal payments batch error: ${error.message}` });
    }
  }

  // Insert balance-funded transactions
  const txnRows = pp.balanceFundedTxns.map((t: NormalizedTxn) => ({
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
      errors.push({ line: 0, raw: "", reason: `Transactions batch error: ${error.message}` });
    } else {
      imported += data?.length ?? 0;
    }
  }

  return { imported, skipped: txnRows.length - imported, errors };
}
