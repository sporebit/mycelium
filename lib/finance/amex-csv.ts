import {
  type CsvBankParser,
  type AccountDescriptor,
  type NormalizedTxn,
  type CsvParseResult,
  type ParseError,
  parseUkDate,
  parseAmount,
  splitCsvLine,
  dedupHash,
  normalizeLines,
} from "./csv-parser";

const EXPECTED_HEADER = "Date,Description,Amount";

export const amexParser: CsvBankParser = {
  id: "amex",

  detect(headerLine: string): boolean {
    return headerLine.trim() === EXPECTED_HEADER;
  },

  async parse(csvText: string): Promise<CsvParseResult> {
    const lines = normalizeLines(csvText);

    if (lines.length === 0) {
      return {
        accounts: new Map(),
        txns: [],
        skipped: [],
        errors: [{ line: 1, raw: "", reason: "Empty file" }],
      };
    }

    const ACCOUNT_KEY = "AMEX";
    const accounts = new Map<string, AccountDescriptor>();
    accounts.set(ACCOUNT_KEY, {
      bank: "Amex",
      external_key: ACCOUNT_KEY,
      label: "Amex",
      account_type: "credit_card",
    });

    type PendingRow = {
      txnDate: string;
      description: string;
      rawAmount: string;
      amount: number;
    };

    const pending: PendingRow[] = [];
    const errors: ParseError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const lineNum = i + 1;
      const fields = splitCsvLine(raw);

      if (fields.length < 3) {
        errors.push({
          line: lineNum,
          raw,
          reason: `Expected 3 fields, got ${fields.length}`,
        });
        continue;
      }

      const dateRaw = fields[0].trim();
      const txnDate = parseUkDate(dateRaw);
      if (!txnDate) {
        errors.push({ line: lineNum, raw, reason: `Invalid date: ${dateRaw}` });
        continue;
      }

      const description = fields[1].trim().replace(/\s+/g, " ");

      const amountRaw = fields[2].trim();
      const fileAmount = parseAmount(amountRaw);
      if (fileAmount === null) {
        errors.push({
          line: lineNum,
          raw,
          reason: `Invalid amount: ${amountRaw}`,
        });
        continue;
      }

      // AMEX sign inversion: positive in file = charge (out) → store negative
      const amount = Math.round(-fileAmount * 100) / 100;

      pending.push({ txnDate, description, rawAmount: amountRaw, amount });
    }

    // Compute occurrence_index per (date, description, rawAmount) group
    const occurrenceCounts = new Map<string, number>();
    const txns: NormalizedTxn[] = [];

    for (const row of pending) {
      const groupKey = `${row.txnDate}|${row.description}|${row.rawAmount}`;
      const idx = occurrenceCounts.get(groupKey) ?? 0;
      occurrenceCounts.set(groupKey, idx + 1);

      const hash = await dedupHash(
        "Amex",
        ACCOUNT_KEY,
        row.txnDate,
        row.description,
        row.rawAmount,
        String(idx),
      );

      txns.push({
        account_key: ACCOUNT_KEY,
        txn_date: row.txnDate,
        txn_type: "",
        description: row.description,
        amount: row.amount,
        debit:
          row.amount < 0
            ? Math.round(Math.abs(row.amount) * 100) / 100
            : null,
        credit: row.amount > 0 ? row.amount : null,
        balance: null,
        dedup_hash: hash,
        fee: null,
        currency: "GBP",
        state: null,
        started_at: null,
        completed_at: null,
      });
    }

    return { accounts, txns, skipped: [], errors };
  },
};
