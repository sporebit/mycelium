/**
 * Gifts (claude/gifts-spec.md) — the shared vocabulary. Isomorphic: no I/O.
 */

export const GIFT_STATUSES = ["idea", "shortlisted", "bought", "given", "rejected"] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

/** The order a gift moves through in place (spec §10: "status advances in place"). */
export const GIFT_FLOW: readonly GiftStatus[] = ["idea", "shortlisted", "bought", "given"];

export const GIFT_ORIGINS = ["manual", "capture", "suggested"] as const;
export type GiftOrigin = (typeof GIFT_ORIGINS)[number];

export const OCCASION_KINDS = ["birthday", "christmas", "valentines", "anniversary", "graduation", "new_job", "wedding", "new_baby", "housewarming", "thank_you", "other"] as const;
export type OccasionKind = (typeof OCCASION_KINDS)[number];

export const OCCASION_KIND_LABEL: Record<OccasionKind, string> = {
  birthday: "Birthday",
  christmas: "Christmas",
  valentines: "Valentine's",
  anniversary: "Anniversary",
  graduation: "Graduation",
  new_job: "New job",
  wedding: "Wedding",
  new_baby: "New baby",
  housewarming: "Housewarming",
  thank_you: "Thank you",
  other: "Other",
};

export const OCCASION_RECURRENCES = ["none", "annual"] as const;
export type OccasionRecurrence = (typeof OCCASION_RECURRENCES)[number];

export const OCCASION_SOURCES = ["manual", "person_dob", "fixed"] as const;
export type OccasionSource = (typeof OCCASION_SOURCES)[number];

/** The fixed calendar every space gets when it asks for it (spec §5). */
export const FIXED_OCCASIONS: ReadonlyArray<{ kind: OccasionKind; name: string; month: number; day: number }> = [
  { kind: "christmas", name: "Christmas", month: 12, day: 25 },
  { kind: "valentines", name: "Valentine's Day", month: 2, day: 14 },
];

export const DEFAULT_LEAD_DAYS: readonly number[] = [30, 7];

/** The last nudge when nothing is bought (spec §6). */
export const FINAL_NUDGE_DAYS = 2;

export type PersonRef = { id: string; display_name: string | null; first_name: string | null; last_name: string | null } | null;

export type OccasionRow = {
  id: string;
  name: string;
  kind: OccasionKind;
  person_id: string | null;
  occurs_on: string;
  recurrence: OccasionRecurrence;
  source: OccasionSource;
  previous_occasion_id: string | null;
  budget: number | null;
  lead_days: number[];
  reminder_task_id: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  space_id?: string | null;
  person?: PersonRef | PersonRef[];
};

export type GiftRow = {
  id: string;
  title: string;
  description: string | null;
  reason: string | null;
  for_person_id: string | null;
  for_label: string | null;
  occasion_id: string | null;
  needed_by: string | null;
  status: GiftStatus;
  rejected_reason: string | null;
  origin: GiftOrigin;
  url: string | null;
  retailer: string | null;
  category: string | null;
  currency: string;
  target_price: number | null;
  paid_amount: number | null;
  paid_at: string | null;
  given_at: string | null;
  bundle_id: string | null;
  purchase_id: string | null;
  price_check: Record<string, unknown> | null;
  price_checked_at: string | null;
  suggestion: Record<string, unknown> | null;
  raw_text: string | null;
  capture_id: string | null;
  created_at: string;
  updated_at: string;
  space_id?: string | null;
  person?: PersonRef | PersonRef[];
  occasion?: { id: string; name: string; occurs_on: string; kind: OccasionKind } | Array<{ id: string; name: string; occurs_on: string; kind: OccasionKind }> | null;
  comment_count?: number;
};

export type GiftCommentRow = {
  id: string;
  gift_id: string;
  body: string;
  body_doc: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export function personName(p: PersonRef | PersonRef[] | undefined): string | null {
  const row = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
  if (!row) return null;
  return row.display_name?.trim() || [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null;
}

export function isGiftStatus(v: unknown): v is GiftStatus {
  return typeof v === "string" && (GIFT_STATUSES as readonly string[]).includes(v);
}

export function isOccasionKind(v: unknown): v is OccasionKind {
  return typeof v === "string" && (OCCASION_KINDS as readonly string[]).includes(v);
}
