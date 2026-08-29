export type ReceiptStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "needs_review"
  | "failed";

export const RECEIPT_STATUSES: readonly ReceiptStatus[] = [
  "uploaded",
  "parsing",
  "parsed",
  "needs_review",
  "failed",
] as const;

/** Why a receipt landed in needs_review. Written by lib/receipts/parse.ts. */
export type ReceiptReviewReason = "total_mismatch" | "no_total";

/** Image media types accepted on upload. HEIC is rejected — see ACCEPTED_MEDIA_TYPES. */
export const ACCEPTED_MEDIA_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export const MAX_RECEIPT_IMAGES = 8;

/** Tolerance in currency units when reconciling parsed_total against total. */
export const TOTAL_TOLERANCE = 0.05;

export type Receipt = {
  id: string;
  user_id: string;
  retailer: string | null;
  purchased_at: string | null;
  currency: string;
  subtotal: number | null;
  vat_total: number | null;
  total: number | null;
  /** Sum of receipt_lines.line_total from the last parse. */
  parsed_total: number | null;
  status: ReceiptStatus;
  review_reason: string | null;
  raw_parse: unknown | null;
  created_at: string;
  updated_at: string;
};

export type ReceiptImage = {
  id: string;
  receipt_id: string;
  storage_path: string;
  sort_order: number;
  media_type: string;
  created_at: string;
};

/** A receipt image with a freshly minted signed URL, as returned by the detail GET. */
export type ReceiptImageWithUrl = ReceiptImage & {
  signed_url: string | null;
};

export type ReceiptLine = {
  id: string;
  receipt_id: string;
  sort_order: number;
  item_code: string | null;
  description: string;
  quantity: number;
  unit_price: number | null;
  vat: number | null;
  line_total: number;
  vat_code: string | null;
  raw_text: string | null;
  created_at: string;
};

/** Shape returned by GET /api/receipts/[id]. */
export type ReceiptDetail = {
  receipt: Receipt;
  images: ReceiptImageWithUrl[];
  lines: ReceiptLine[];
};

/**
 * One line as the model returns it, before it is given an id and a receipt_id.
 * Every field except description and line_total may come back null.
 */
export type ParsedReceiptLine = {
  item_code: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  vat: number | null;
  line_total: number | null;
  vat_code: string | null;
  raw_text: string | null;
};

/** The JSON contract the parse prompt asks the model to return. */
export type ParsedReceipt = {
  retailer: string | null;
  purchased_at: string | null;
  currency: string | null;
  subtotal: number | null;
  vat_total: number | null;
  total: number | null;
  lines: ParsedReceiptLine[];
};

/** Outcome of a parse run, as written back onto the receipt row. */
export type ParseOutcome = {
  status: Extract<ReceiptStatus, "parsed" | "needs_review" | "failed">;
  review_reason: string | null;
  parsed_total: number | null;
  line_count: number;
};
