import { callClaudeJSON } from "@/lib/ai/anthropic";
import type { SheetData } from "./fetchSheet";
import {
  CATEGORY_TAGS,
  type CategoryTag,
  type FinanceCategory,
  type FinanceSnapshot,
} from "./types";

export const FINANCE_SYSTEM_PROMPT = `You are extracting a net-worth snapshot from a spreadsheet exported as raw row data.

The user's sheet has multiple tabs covering accounts, receivables, debts, and a summary. Extract a single point-in-time snapshot.

Rules:
- Avoid double-counting. If a tab summarises another tab (e.g. a Net Worth summary that pulls from Accounts), use only the source tab — don't add summary rows on top of source rows.
- For time-series tabs (history, monthly snapshot), use only the most recent row.
- Receivables (money owed to the user) count as positive assets.
- Personal debts owed BY the user (e.g. money borrowed from a friend) count as negative.
- Credit card / loan liabilities are stored as negative numbers in the sheet already — don't double-negate them.
- Cash, current accounts, savings, ISA cash → tag "liquid".
- Stocks, ETFs, S&S ISA, pensions, brokerage → tag "equities".
- Crypto holdings → tag "crypto".
- Private investments, angel deals, illiquid holdings, real estate equity → tag "private".
- Credit cards, loans, mortgages → tag "liability" (value should be negative).
- Money owed to the user → tag "receivable".
- Money the user owes informally → tag "personal_debt" (value should be negative).

Return JSON ONLY with this exact shape — no markdown, no preface:

{
  "net_worth": number,         // sum of all categories
  "currency": "GBP",           // unless the sheet clearly uses a different currency
  "as_of": "YYYY-MM-DD",       // most recent date evident in the sheet
  "categories": [
    { "name": string, "value": number, "tag": "liquid"|"equities"|"crypto"|"private"|"liability"|"receivable"|"personal_debt" }
  ],
  "notes": string              // flag any ambiguity you had to guess about; empty string if clean
}`;

function validate(obj: unknown): FinanceSnapshot | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.net_worth !== "number" || !Number.isFinite(o.net_worth)) return null;
  if (typeof o.currency !== "string") return null;
  if (typeof o.as_of !== "string") return null;
  if (typeof o.notes !== "string") return null;
  if (!Array.isArray(o.categories)) return null;

  const categories: FinanceCategory[] = [];
  for (const c of o.categories) {
    if (!c || typeof c !== "object") return null;
    const cat = c as Record<string, unknown>;
    if (typeof cat.name !== "string") return null;
    if (typeof cat.value !== "number" || !Number.isFinite(cat.value)) return null;
    if (
      typeof cat.tag !== "string" ||
      !(CATEGORY_TAGS as readonly string[]).includes(cat.tag)
    ) {
      return null;
    }
    categories.push({
      name: cat.name,
      value: cat.value,
      tag: cat.tag as CategoryTag,
    });
  }

  return {
    net_worth: o.net_worth,
    currency: o.currency,
    as_of: o.as_of,
    categories,
    notes: o.notes,
  };
}

function buildUserMessage(sheets: SheetData[]): string {
  const lines: string[] = [];
  for (const sheet of sheets) {
    lines.push(`# Tab: ${sheet.sheetName}`);
    for (const row of sheet.rows) {
      lines.push(JSON.stringify(row));
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function extractSnapshot(
  sheets: SheetData[]
): Promise<FinanceSnapshot | null> {
  const userMessage = buildUserMessage(sheets);
  const result = await callClaudeJSON<FinanceSnapshot>({
    systemPrompt: FINANCE_SYSTEM_PROMPT,
    userMessage,
    validate,
    maxTokens: 4096,
    timeoutMs: 60_000,
  });
  if (!result) {
    console.error("[finance] snapshot validation failed");
  }
  return result;
}
