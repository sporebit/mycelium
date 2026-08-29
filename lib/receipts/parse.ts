import { MODEL_VISION } from "@/lib/config/models";
import { createServerClient } from "@/lib/supabase/server";
import { downloadReceiptImage } from "@/lib/storage/receipts";
import {
  TOTAL_TOLERANCE,
  type ParseOutcome,
  type ParsedReceipt,
  type ParsedReceiptLine,
} from "@/lib/types/receipt";

export const PARSE_PROMPT = `You are reading photographs of a single till receipt. Return ONLY valid JSON, no markdown fences, matching exactly this shape:

{
  "retailer": "string | null",
  "purchased_at": "YYYY-MM-DD | null",
  "currency": "string | null",
  "subtotal": "number | null",
  "vat_total": "number | null",
  "total": "number | null",
  "lines": [
    {
      "item_code": "string | null",
      "description": "string",
      "quantity": "number | null",
      "unit_price": "number | null",
      "vat": "number | null",
      "line_total": "number | null",
      "vat_code": "string | null",
      "raw_text": "string | null"
    }
  ]
}

Rules:
- The images are ordered pages of ONE receipt and they OVERLAP. The same line
  may appear at the bottom of one image and the top of the next. Emit every
  line exactly ONCE.
- Preserve the order the lines appear on the receipt, top to bottom.
- Some receipts (Costco in particular) print a quantity on its own line above
  or below the item, in the form "2 @ 3.49". Fold that into the item's line:
  set quantity to 2 and unit_price to 3.49. Do not emit the quantity line as a
  separate item.
- line_total is the amount actually charged for that line.
- raw_text is the line exactly as printed, for auditing.
- Do not invent lines that are not visible. If a value is not readable, use
  null rather than guessing.
- Do not include subtotal, VAT, total, change, or payment method rows in
  "lines" — those belong in the top-level fields.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Coerces the model's JSON into ParsedReceipt, dropping unusable lines. */
export function normaliseParsed(raw: unknown): ParsedReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  const lines: ParsedReceiptLine[] = [];
  for (const item of rawLines) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const description = str(l.description);
    // A line with no description is unusable — there is nothing to show or edit.
    if (!description) continue;
    lines.push({
      item_code: str(l.item_code),
      description,
      quantity: num(l.quantity),
      unit_price: num(l.unit_price),
      vat: num(l.vat),
      line_total: num(l.line_total),
      vat_code: str(l.vat_code),
      raw_text: str(l.raw_text),
    });
  }

  return {
    retailer: str(r.retailer),
    purchased_at: str(r.purchased_at),
    currency: str(r.currency),
    subtotal: num(r.subtotal),
    vat_total: num(r.vat_total),
    total: num(r.total),
    lines,
  };
}

/** Rounds to 2dp without floating-point tails (0.1 + 0.2 style). */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

type ImageInput = { buffer: Buffer; mediaType: string };

/**
 * One Anthropic call with every page as an ordered image block in a single
 * user message. Sending them together (rather than page by page, as the
 * recipes flow does) is what lets the model de-duplicate the overlap between
 * consecutive photographs of the same receipt.
 */
async function callVision(images: ImageInput[]): Promise<{
  parsed: ParsedReceipt | null;
  raw: unknown;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const content: Record<string, unknown>[] = images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType,
      data: img.buffer.toString("base64"),
    },
  }));
  content.push({ type: "text", text: PARSE_PROMPT });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_VISION,
      max_tokens: 8192,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`vision API ${res.status}: ${err.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = json.content?.find((b) => b.type === "text")?.text ?? "";
  const raw = extractJson(text);
  return { parsed: normaliseParsed(raw), raw: raw ?? text };
}

/**
 * Parses a receipt's stored images and writes the results back.
 *
 * Replaces any existing lines, so a reparse is idempotent rather than
 * additive. Sets status to 'parsing' while it runs so a slow parse is visible
 * in the list rather than looking stuck on 'uploaded'.
 */
export async function parseReceipt(receiptId: string): Promise<ParseOutcome> {
  const supabase = createServerClient();

  await supabase
    .from("receipts")
    .update({ status: "parsing", updated_at: new Date().toISOString() })
    .eq("id", receiptId);

  const { data: imageRows } = await supabase
    .from("receipt_images")
    .select("storage_path, media_type, sort_order")
    .eq("receipt_id", receiptId)
    .order("sort_order", { ascending: true });

  const rows = (imageRows ?? []) as {
    storage_path: string;
    media_type: string;
    sort_order: number;
  }[];

  const failed = async (reason: string): Promise<ParseOutcome> => {
    await supabase
      .from("receipts")
      .update({
        status: "failed",
        review_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);
    return { status: "failed", review_reason: reason, parsed_total: null, line_count: 0 };
  };

  if (rows.length === 0) return failed("no_images");

  const images: ImageInput[] = [];
  for (const row of rows) {
    const buffer = await downloadReceiptImage(row.storage_path);
    if (!buffer) continue;
    images.push({ buffer, mediaType: row.media_type });
  }
  if (images.length === 0) return failed("images_unreadable");

  let parsed: ParsedReceipt | null;
  let raw: unknown;
  try {
    ({ parsed, raw } = await callVision(images));
  } catch (err) {
    console.error("[receipts/parse]", err);
    return failed("vision_call_failed");
  }
  if (!parsed) return failed("unparseable_response");

  // Replace lines wholesale — a reparse should not append to the last run.
  await supabase.from("receipt_lines").delete().eq("receipt_id", receiptId);

  if (parsed.lines.length > 0) {
    const lineRows = parsed.lines.map((l, i) => ({
      receipt_id: receiptId,
      sort_order: i,
      item_code: l.item_code,
      description: l.description,
      quantity: l.quantity ?? 1,
      unit_price: l.unit_price,
      vat: l.vat,
      line_total: l.line_total ?? 0,
      vat_code: l.vat_code,
      raw_text: l.raw_text,
    }));
    const { error: insertErr } = await supabase.from("receipt_lines").insert(lineRows);
    if (insertErr) {
      console.error("[receipts/parse] line insert failed:", insertErr.message);
      return failed("line_insert_failed");
    }
  }

  const parsedTotal = money(
    parsed.lines.reduce((sum, l) => sum + (l.line_total ?? 0), 0),
  );

  // Reconciliation. A receipt whose lines do not add up to its printed total
  // is not trustworthy enough to file silently.
  let status: ParseOutcome["status"] = "parsed";
  let reviewReason: string | null = null;
  if (parsed.total === null) {
    status = "needs_review";
    reviewReason = "no_total";
  } else if (Math.abs(parsedTotal - parsed.total) > TOTAL_TOLERANCE) {
    status = "needs_review";
    reviewReason = "total_mismatch";
  }

  await supabase
    .from("receipts")
    .update({
      retailer: parsed.retailer,
      purchased_at: parsed.purchased_at,
      currency: parsed.currency ?? "GBP",
      subtotal: parsed.subtotal,
      vat_total: parsed.vat_total,
      total: parsed.total,
      parsed_total: parsedTotal,
      status,
      review_reason: reviewReason,
      raw_parse: raw as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receiptId);

  return {
    status,
    review_reason: reviewReason,
    parsed_total: parsedTotal,
    line_count: parsed.lines.length,
  };
}
