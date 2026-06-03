export type AccountDescriptor = {
  bank: string;
  external_key: string;
  label: string;
  account_type: string;
  account_number?: string | null;
  sort_code?: string | null;
};

export type NormalizedTxn = {
  account_key: string;
  txn_date: string;
  txn_type: string;
  description: string;
  amount: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  dedup_hash: string;
  fee: number | null;
  currency: string;
  state: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type SkipInfo = {
  line: number;
  raw: string;
  reason: string;
};

export type ParseError = {
  line: number;
  raw: string;
  reason: string;
};

export type CsvParseResult = {
  accounts: Map<string, AccountDescriptor>;
  txns: NormalizedTxn[];
  skipped: SkipInfo[];
  errors: ParseError[];
};

export interface CsvBankParser {
  id: string;
  detect(headerLine: string): boolean;
  parse(csvText: string): Promise<CsvParseResult>;
}

// ── Shared utilities ──

export function stripBom(text: string): string {
  return text.replace(/^﻿/, "");
}

export function normalizeLines(csvText: string): string[] {
  return stripBom(csvText)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
}

export function parseUkDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

export function splitCsvLine(line: string): string[] {
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

export async function dedupHash(...parts: string[]): Promise<string> {
  const payload = parts.join("|");
  const encoded = new TextEncoder().encode(payload);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(payload).digest("hex");
}
