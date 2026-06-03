import {
  type AccountDescriptor,
  type NormalizedTxn,
  type ParseError,
  parseUkDate,
  splitCsvLine,
  dedupHash,
  normalizeLines,
} from "./csv-parser";

export type PayPalRawRow = {
  date: string;
  description: string;
  currency: string;
  gross: number;
  fee: number;
  net: number;
  transaction_id: string;
  name: string;
  ref_txn_id: string;
};

export type PayPalPaymentRow = {
  transaction_id: string;
  ref_txn_id: string | null;
  paypal_date: string;
  merchant_name: string | null;
  description: string;
  currency: string;
  gross: number;
  fee: number;
  net: number;
  amount: number;
  funded: boolean;
  funding_type: string | null;
  match_status: string;
};

export type PayPalSummary = {
  total_payments: number;
  balance_funded: number;
  card_funded: number;
  bank_funded: number;
  skipped_legs: number;
};

export type PayPalImportResult = {
  payments: PayPalPaymentRow[];
  balanceFundedTxns: NormalizedTxn[];
  account: AccountDescriptor;
  summary: PayPalSummary;
  errors: ParseError[];
};

function parsePayPalAmount(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export const PAYPAL_ACCOUNT: AccountDescriptor = {
  bank: "PayPal",
  external_key: "PAYPAL",
  label: "PayPal",
  account_type: "wallet",
};

const ACCOUNT_KEY = "PAYPAL";

// ── Shared classification: same logic for CSV and API ingestion paths ──

export async function classifyPayPalRows(
  rows: PayPalRawRow[],
): Promise<Omit<PayPalImportResult, "errors">> {
  // Reverse lookup: payment's transaction_id → rows that reference it
  const fundingByPaymentId = new Map<string, PayPalRawRow[]>();
  for (const row of rows) {
    if (row.ref_txn_id) {
      const list = fundingByPaymentId.get(row.ref_txn_id) ?? [];
      list.push(row);
      fundingByPaymentId.set(row.ref_txn_id, list);
    }
  }

  const payments: PayPalPaymentRow[] = [];
  const balanceFundedTxns: NormalizedTxn[] = [];
  let cardFunded = 0;
  let bankFunded = 0;
  let balanceFundedCount = 0;
  let skippedLegs = 0;

  for (const row of rows) {
    if (row.name && row.net < 0) {
      const refs = fundingByPaymentId.get(row.transaction_id) ?? [];

      let funded = false;
      let fundingType: string | null = null;

      for (const fleg of refs) {
        if (fleg.description.includes("General Card Deposit")) {
          funded = true;
          fundingType = "card";
          break;
        }
        if (fleg.description.includes("Bank Deposit")) {
          funded = true;
          fundingType = "bank";
          break;
        }
      }

      const matchStatus = funded ? "pending" : "standalone";

      payments.push({
        transaction_id: row.transaction_id,
        ref_txn_id: row.ref_txn_id || null,
        paypal_date: row.date,
        merchant_name: row.name || null,
        description: row.description,
        currency: row.currency,
        gross: row.gross,
        fee: row.fee,
        net: row.net,
        amount: row.net,
        funded,
        funding_type: fundingType,
        match_status: matchStatus,
      });

      if (funded) {
        if (fundingType === "card") cardFunded++;
        else bankFunded++;
      } else {
        balanceFundedCount++;

        const hash = await dedupHash("PayPal", ACCOUNT_KEY, row.transaction_id);

        balanceFundedTxns.push({
          account_key: ACCOUNT_KEY,
          txn_date: row.date,
          txn_type: row.description,
          description: row.name,
          amount: row.net,
          debit: Math.round(Math.abs(row.net) * 100) / 100,
          credit: null,
          balance: null,
          dedup_hash: hash,
          fee: row.fee !== 0 ? row.fee : null,
          currency: row.currency,
          state: null,
          started_at: null,
          completed_at: null,
        });
      }
    } else {
      skippedLegs++;
    }
  }

  return {
    payments,
    balanceFundedTxns,
    account: PAYPAL_ACCOUNT,
    summary: {
      total_payments: payments.length,
      balance_funded: balanceFundedCount,
      card_funded: cardFunded,
      bank_funded: bankFunded,
      skipped_legs: skippedLegs,
    },
  };
}

// ── CSV-specific: header detection + parsing ──

export function detectPayPal(headerLine: string): boolean {
  const lower = headerLine.toLowerCase();
  return (
    lower.includes("transaction id") &&
    lower.includes("reference txn id") &&
    lower.includes("gross") &&
    lower.includes("net") &&
    lower.includes('"name"')
  );
}

export async function parsePayPalCsv(
  csvText: string,
): Promise<PayPalImportResult> {
  const lines = normalizeLines(csvText);
  const errors: ParseError[] = [];
  const emptyResult: PayPalImportResult = {
    payments: [],
    balanceFundedTxns: [],
    account: PAYPAL_ACCOUNT,
    summary: { total_payments: 0, balance_funded: 0, card_funded: 0, bank_funded: 0, skipped_legs: 0 },
    errors: [{ line: 1, raw: "", reason: "Empty file" }],
  };

  if (lines.length === 0) return emptyResult;

  const headerFields = splitCsvLine(lines[0]).map((f) => f.trim().toLowerCase());
  const col = (name: string) => headerFields.indexOf(name);

  const iDate = col("date");
  const iDesc = col("description");
  const iCurrency = col("currency");
  const iGross = col("gross");
  const iFee = col("fee");
  const iNet = col("net");
  const iTxnId = col("transaction id");
  const iName = col("name");
  const iRefTxnId = col("reference txn id");

  if (
    [iDate, iDesc, iCurrency, iGross, iFee, iNet, iTxnId, iName, iRefTxnId].some(
      (i) => i === -1,
    )
  ) {
    return { ...emptyResult, errors: [{ line: 1, raw: lines[0], reason: "Missing required PayPal columns" }] };
  }

  const allRows: PayPalRawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;
    const fields = splitCsvLine(raw);

    const txnId = (fields[iTxnId] ?? "").trim();
    if (!txnId) {
      errors.push({ line: lineNum, raw, reason: "Missing Transaction ID" });
      continue;
    }

    const dateRaw = (fields[iDate] ?? "").trim();
    const txnDate = parseUkDate(dateRaw);
    if (!txnDate) {
      errors.push({ line: lineNum, raw, reason: `Invalid date: ${dateRaw}` });
      continue;
    }

    allRows.push({
      date: txnDate,
      description: (fields[iDesc] ?? "").trim(),
      currency: (fields[iCurrency] ?? "").trim() || "GBP",
      gross: parsePayPalAmount(fields[iGross] ?? ""),
      fee: parsePayPalAmount(fields[iFee] ?? ""),
      net: parsePayPalAmount(fields[iNet] ?? ""),
      transaction_id: txnId,
      name: (fields[iName] ?? "").trim(),
      ref_txn_id: (fields[iRefTxnId] ?? "").trim(),
    });
  }

  const classified = await classifyPayPalRows(allRows);
  return { ...classified, errors };
}
