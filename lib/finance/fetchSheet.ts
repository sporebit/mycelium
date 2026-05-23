import { google } from "googleapis";
import ExcelJS from "exceljs";

export type SheetData = {
  sheetName: string;
  rows: Array<Array<string | number | boolean | null>>;
};

const CACHE_TTL_MS = 60_000;
let cache: { data: SheetData[]; expiresAt: number } | null = null;

function normalize(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return normalize(o.result);
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("");
    }
    if ("text" in o) return normalize(o.text);
    if ("formula" in o) return null; // formula with no cached result
    if ("hyperlink" in o && "text" in o) return normalize((o as { text: unknown }).text);
    return null;
  }
  return null;
}

export class FinanceNotConfiguredError extends Error {
  constructor() {
    super("Finance not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEETS_FINANCE_ID");
    this.name = "FinanceNotConfiguredError";
  }
}

export async function fetchFinanceSheet(opts: { force?: boolean } = {}): Promise<SheetData[]> {
  if (!opts.force && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const fileId = process.env.GOOGLE_SHEETS_FINANCE_ID;

  if (!email || !key || !fileId) {
    throw new FinanceNotConfiguredError();
  }

  // Vercel stores the key as a single-line string with \n escapes; convert
  // back to real newlines for the PEM parser. Defensive — no-op if already real.
  key = key.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const drive = google.drive({ version: "v3", auth });
  const exportRes = await drive.files.export(
    {
      fileId,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    { responseType: "arraybuffer" }
  );

  const arrayBuffer = exportRes.data as ArrayBuffer;
  const workbook = new ExcelJS.Workbook();
  // exceljs's load() expects the legacy non-generic Buffer; @types/node 24+
  // made Buffer generic, breaking the assignability check. Cast around it —
  // the runtime accepts ArrayBuffer here.
  await (workbook.xlsx.load as (data: ArrayBuffer) => Promise<unknown>)(
    arrayBuffer
  );

  const sheets: SheetData[] = [];
  workbook.eachSheet((ws) => {
    const rows: Array<Array<string | number | boolean | null>> = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      // exceljs row.values is 1-indexed sparse; slice off the leading hole.
      const arr: Array<string | number | boolean | null> = [];
      for (let i = 1; i < values.length; i++) {
        arr.push(normalize(values[i]));
      }
      // Drop fully-empty rows (all null) so Claude doesn't waste tokens.
      if (arr.some((v) => v !== null && v !== "")) {
        rows.push(arr);
      }
    });
    sheets.push({ sheetName: ws.name, rows });
  });

  cache = { data: sheets, expiresAt: Date.now() + CACHE_TTL_MS };
  return sheets;
}
