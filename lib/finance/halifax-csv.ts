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

export { dedupHash };
export type { ParseError };

export type ParsedRow = {
  txn_date: string;
  txn_type: string;
  sort_code: string;
  account_number: string;
  description: string;
  amount: number;
  debit: number | null;
  credit: number | null;
  balance: number;
  dedup_hash: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: ParseError[];
};

const EXPECTED_HEADER =
  "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance";

export async function parseHalifaxCsv(csvText: string): Promise<ParseResult> {
  const lines = normalizeLines(csvText);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, raw: "", reason: "Empty file" }] };
  }

  const header = lines[0].trim();
  if (header !== EXPECTED_HEADER) {
    return {
      rows: [],
      errors: [
        { line: 1, raw: header, reason: "Unexpected header — not a Halifax CSV" },
      ],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;

    const fields = splitCsvLine(raw);
    if (fields.length < 8) {
      errors.push({
        line: lineNum,
        raw,
        reason: `Expected 8 fields, got ${fields.length}`,
      });
      continue;
    }

    const dateRaw = fields[0].trim();
    const txnDate = parseUkDate(dateRaw);
    if (!txnDate) {
      errors.push({ line: lineNum, raw, reason: `Invalid date: ${dateRaw}` });
      continue;
    }

    const txnType = fields[1].trim();
    const sortCode = fields[2].trim().replace(/^'/, "");
    const accountNumber = fields[3].trim();
    const description = fields[4].trim();

    const debitRaw = fields[5].trim();
    const creditRaw = fields[6].trim();
    const balanceRaw = fields[7].trim();

    const debit = parseAmount(debitRaw);
    const credit = parseAmount(creditRaw);
    const balance = parseAmount(balanceRaw);

    if (balance === null) {
      errors.push({
        line: lineNum,
        raw,
        reason: `Invalid balance: ${balanceRaw}`,
      });
      continue;
    }

    if (debit === null && credit === null) {
      errors.push({
        line: lineNum,
        raw,
        reason: "Both debit and credit are empty",
      });
      continue;
    }

    const amount = credit !== null ? credit : -debit!;

    if (!accountNumber) {
      errors.push({ line: lineNum, raw, reason: "Missing account number" });
      continue;
    }

    const hash = await dedupHash(
      accountNumber,
      txnDate,
      description,
      debitRaw,
      creditRaw,
      balanceRaw,
    );

    rows.push({
      txn_date: txnDate,
      txn_type: txnType,
      sort_code: sortCode,
      account_number: accountNumber,
      description,
      amount,
      debit: debit !== null ? debit : null,
      credit: credit !== null ? credit : null,
      balance,
      dedup_hash: hash,
    });
  }

  return { rows, errors };
}

export const halifaxParser: CsvBankParser = {
  id: "halifax",

  detect(headerLine: string): boolean {
    return headerLine.trim() === EXPECTED_HEADER;
  },

  async parse(csvText: string): Promise<CsvParseResult> {
    const legacy = await parseHalifaxCsv(csvText);

    const accounts = new Map<string, AccountDescriptor>();
    const txns: NormalizedTxn[] = [];

    for (const row of legacy.rows) {
      if (!accounts.has(row.account_number)) {
        accounts.set(row.account_number, {
          bank: "Halifax",
          external_key: row.account_number,
          label: `Halifax ••${row.account_number.slice(-4)}`,
          account_type: "current",
          account_number: row.account_number,
          sort_code: row.sort_code || null,
        });
      }

      txns.push({
        account_key: row.account_number,
        txn_date: row.txn_date,
        txn_type: row.txn_type,
        description: row.description,
        amount: row.amount,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        dedup_hash: row.dedup_hash,
        fee: null,
        currency: "GBP",
        state: null,
        started_at: null,
        completed_at: null,
      });
    }

    return {
      accounts,
      txns,
      skipped: [],
      errors: legacy.errors,
    };
  },
};
