import {
  type CsvBankParser,
  type AccountDescriptor,
  type NormalizedTxn,
  type CsvParseResult,
  type ParseError,
  type SkipInfo,
  parseAmount,
  splitCsvLine,
  dedupHash,
  normalizeLines,
} from "./csv-parser";

const EXPECTED_HEADER =
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";

function parseIsoDate(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m ? m[1] : null;
}

export const revolutParser: CsvBankParser = {
  id: "revolut",

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

    const ACCOUNT_KEY = "REVOLUT-GBP-CURRENT";
    const accounts = new Map<string, AccountDescriptor>();
    accounts.set(ACCOUNT_KEY, {
      bank: "Revolut",
      external_key: ACCOUNT_KEY,
      label: "Revolut",
      account_type: "current",
    });

    const txns: NormalizedTxn[] = [];
    const skipped: SkipInfo[] = [];
    const errors: ParseError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const lineNum = i + 1;
      const fields = splitCsvLine(raw);

      if (fields.length < 10) {
        errors.push({
          line: lineNum,
          raw,
          reason: `Expected 10 fields, got ${fields.length}`,
        });
        continue;
      }

      const type = fields[0].trim();
      const startedRaw = fields[2].trim();
      const completedRaw = fields[3].trim();
      const description = fields[4].trim();
      const amountRaw = fields[5].trim();
      const feeRaw = fields[6].trim();
      const currency = fields[7].trim() || "GBP";
      const state = fields[8].trim();
      const balanceRaw = fields[9].trim();

      if (state.toUpperCase() !== "COMPLETED") {
        skipped.push({ line: lineNum, raw, reason: `state=${state}` });
        continue;
      }

      const dateSource = completedRaw || startedRaw;
      if (!dateSource) {
        errors.push({ line: lineNum, raw, reason: "No date available" });
        continue;
      }

      const txnDate = parseIsoDate(dateSource);
      if (!txnDate) {
        errors.push({
          line: lineNum,
          raw,
          reason: `Invalid date: ${dateSource}`,
        });
        continue;
      }

      const amount = parseAmount(amountRaw);
      if (amount === null) {
        errors.push({
          line: lineNum,
          raw,
          reason: `Invalid amount: ${amountRaw}`,
        });
        continue;
      }

      const fee = parseAmount(feeRaw);
      const balance = parseAmount(balanceRaw);
      const completedAt = completedRaw || null;
      const startedAt = startedRaw || null;

      const hash = await dedupHash(
        "Revolut",
        ACCOUNT_KEY,
        completedAt ?? startedAt ?? "",
        description,
        amountRaw,
        feeRaw,
        balanceRaw,
      );

      txns.push({
        account_key: ACCOUNT_KEY,
        txn_date: txnDate,
        txn_type: type,
        description,
        amount,
        debit: amount < 0 ? Math.round(Math.abs(amount) * 100) / 100 : null,
        credit: amount > 0 ? amount : null,
        balance,
        dedup_hash: hash,
        fee,
        currency,
        state,
        started_at: startedAt,
        completed_at: completedAt,
      });
    }

    return { accounts, txns, skipped, errors };
  },
};
