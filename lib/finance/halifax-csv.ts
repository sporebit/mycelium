/**
 * Halifax CSV parser.
 *
 * Expected header (exact):
 *   Transaction Date,Transaction Type,Sort Code,Account Number,
 *   Transaction Description,Debit Amount,Credit Amount,Balance
 *
 * Gotchas handled:
 *   - DD/MM/YYYY dates (UK, never US)
 *   - Sort code has leading apostrophe ('11-02-39 → 11-02-39)
 *   - Two amount columns; exactly one populated per row
 *   - dedup_hash = sha-256 of account_number|txn_date|description|debit|credit|balance
 */

export type ParsedRow = {
  txn_date: string; // YYYY-MM-DD
  txn_type: string;
  sort_code: string;
  account_number: string;
  description: string;
  amount: number; // signed: credit +, debit -
  debit: number | null;
  credit: number | null;
  balance: number;
  dedup_hash: string;
};

export type ParseError = {
  line: number;
  raw: string;
  reason: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: ParseError[];
};

const EXPECTED_HEADER =
  "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance";

function parseUkDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic dedup hash. Uses the Web Crypto API (available in Node 18+
 * and all modern browsers) to produce a hex SHA-256 digest over the
 * canonical fields that uniquely identify a transaction row.
 *
 * Balance is included to disambiguate genuine same-day, same-amount repeats
 * (e.g. two £19 fees on the same day that happen to have different running
 * balances).
 */
export async function dedupHash(
  accountNumber: string,
  txnDate: string,
  description: string,
  debit: string,
  credit: string,
  balance: string,
): Promise<string> {
  const payload = [accountNumber, txnDate, description, debit, credit, balance].join("|");
  const encoded = new TextEncoder().encode(payload);

  // Node 20+ globalThis.crypto.subtle is available; fall back to node:crypto
  // for older runtimes (Vercel serverless).
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback — dynamic import so it doesn't break browser bundles.
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(payload).digest("hex");
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export async function parseHalifaxCsv(csvText: string): Promise<ParseResult> {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, raw: "", reason: "Empty file" }] };
  }

  const header = lines[0].trim();
  if (header !== EXPECTED_HEADER) {
    return {
      rows: [],
      errors: [{ line: 1, raw: header, reason: "Unexpected header — not a Halifax CSV" }],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;

    const fields = splitCsvLine(raw);
    if (fields.length < 8) {
      errors.push({ line: lineNum, raw, reason: `Expected 8 fields, got ${fields.length}` });
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
      errors.push({ line: lineNum, raw, reason: `Invalid balance: ${balanceRaw}` });
      continue;
    }

    if (debit === null && credit === null) {
      errors.push({ line: lineNum, raw, reason: "Both debit and credit are empty" });
      continue;
    }

    const amount = credit !== null ? credit : -(debit!);

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
