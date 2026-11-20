/**
 * Gifts — server helpers (spec §4, §5, §6, §8, §9). Everything goes through
 * the caller's client: the owner-only policies (0181) are the wall, so a
 * read here never sees anyone else's rows and a write never lands in
 * anyone else's space.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSpeaker } from "@/lib/quotes/server";
import { todayLondon } from "@/lib/tickets/when";
import { moveTicket } from "@/lib/tickets/server";
import { canConvert, purchaseFromGift } from "./convert";
import { extractGiftFromText, giftFromClassification, type GiftExtraction } from "./extract";
import { similarGifts, type Similar } from "./similar";
import { type GiftRow, type GiftStatus, type OccasionRow, isGiftStatus, isOccasionKind } from "./types";

export const PERSON_SELECT = "person:people!gifts_for_person_id_fkey(id, display_name, first_name, last_name)";
export const OCCASION_SELECT = "id, name, kind, person_id, occurs_on, recurrence, source, previous_occasion_id, budget, lead_days, reminder_task_id, notes, archived_at, created_at, updated_at, space_id, person:people!gift_occasions_person_id_fkey(id, display_name, first_name, last_name)";
export const GIFT_SELECT = `id, title, description, reason, for_person_id, for_label, occasion_id, needed_by, status, rejected_reason, origin, url, retailer, category, currency, target_price, paid_amount, paid_at, given_at, bundle_id, purchase_id, price_check, price_checked_at, suggestion, raw_text, capture_id, created_at, updated_at, space_id, ${PERSON_SELECT}, occasion:gift_occasions!gifts_occasion_id_fkey(id, name, occurs_on, kind)`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export async function canSeePerson(db: SupabaseClient, personId: string): Promise<boolean> {
  if (!isUuid(personId)) return false;
  const { data } = await db.from("people").select("id").eq("id", personId).is("deleted_at", null).maybeSingle();
  return !!data;
}

export async function canSeeOccasion(db: SupabaseClient, occasionId: string): Promise<boolean> {
  if (!isUuid(occasionId)) return false;
  const { data } = await db.from("gift_occasions").select("id").eq("id", occasionId).maybeSingle();
  return !!data;
}

/** The recipient by alias (spec decision 11): exactly one live person → resolved; zero or many → unresolved. Never creates a person. */
export async function resolveRecipient(db: SupabaseClient, name: string | null): Promise<{ person_id: string | null; candidates: string[] }> {
  if (!name) return { person_id: null, candidates: [] };
  const direct = await resolveSpeaker(db, name);
  if (direct.person_id || direct.candidates.length) return direct;
  // "Mum" / "my brother" may be an alias; a first name typed in full may not be, so try the people row too
  const { data } = await db.from("people").select("id").eq("tier", "person").is("deleted_at", null).is("archived_at", null).or(`first_name.ilike.${name.replace(/[%,()*]/g, " ")},display_name.ilike.${name.replace(/[%,()*]/g, " ")}`).limit(5);
  const ids = Array.from(new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id)));
  return { person_id: ids.length === 1 ? ids[0] : null, candidates: ids };
}

/** An open occasion of that kind for that person (or shared, for Christmas and the like), soonest first; null when none. Never creates one. */
export async function matchOpenOccasion(db: SupabaseClient, kind: string | null, personId: string | null, today = todayLondon()): Promise<string | null> {
  if (!kind || !isOccasionKind(kind)) return null;
  let q = db.from("gift_occasions").select("id, person_id, occurs_on").eq("kind", kind).is("archived_at", null).gte("occurs_on", today).order("occurs_on", { ascending: true }).limit(5);
  q = personId ? q.eq("person_id", personId) : q.is("person_id", null);
  const { data } = await q;
  const first = ((data ?? []) as Array<{ id: string }>)[0];
  return first?.id ?? null;
}

export async function personNameById(db: SupabaseClient, personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const { data } = await db.from("people").select("display_name, first_name, last_name").eq("id", personId).maybeSingle();
  const p = data as { display_name: string | null; first_name: string | null; last_name: string | null } | null;
  if (!p) return null;
  return p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
}

/** Near-duplicates among the caller's own gifts for the same recipient (spec §4.7). */
export async function findSimilarGifts(db: SupabaseClient, title: string, recipient: { for_person_id: string | null; for_label: string | null }, excludeId?: string | null): Promise<Similar[]> {
  const { data } = await db.from("gifts").select("id, title, for_person_id, for_label, status").order("created_at", { ascending: false }).limit(1000);
  return similarGifts(title, recipient, (data ?? []) as Array<{ id: string; title: string; for_person_id: string | null; for_label: string | null; status: string }>, excludeId);
}

export type CreateGiftInput = {
  title: string;
  description?: string | null;
  reason?: string | null;
  for_person_id?: string | null;
  for_label?: string | null;
  occasion_id?: string | null;
  needed_by?: string | null;
  status?: GiftStatus;
  origin?: "manual" | "capture" | "suggested";
  url?: string | null;
  retailer?: string | null;
  category?: string | null;
  currency?: string | null;
  target_price?: number | null;
  raw_text?: string | null;
  capture_id?: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** The one insert path: the manual POST, the review approve and the reroute all come here. `needed_by` defaults from the occasion. */
export async function createGift(db: SupabaseClient, input: CreateGiftInput): Promise<GiftRow> {
  const title = str(input.title);
  if (!title) throw new Error("title required");
  let neededBy = typeof input.needed_by === "string" && DATE_RE.test(input.needed_by) ? input.needed_by : null;
  const occasionId = isUuid(input.occasion_id) ? input.occasion_id : null;
  if (!neededBy && occasionId) {
    const { data } = await db.from("gift_occasions").select("occurs_on").eq("id", occasionId).maybeSingle();
    neededBy = (data as { occurs_on: string } | null)?.occurs_on ?? null;
  }
  const row = {
    title: title.slice(0, 200),
    description: str(input.description),
    reason: str(input.reason),
    for_person_id: isUuid(input.for_person_id) ? input.for_person_id : null,
    for_label: isUuid(input.for_person_id) ? null : str(input.for_label),
    occasion_id: occasionId,
    needed_by: neededBy,
    status: isGiftStatus(input.status) ? input.status : "idea",
    origin: input.origin === "capture" || input.origin === "suggested" ? input.origin : "manual",
    url: str(input.url),
    retailer: str(input.retailer),
    category: str(input.category),
    currency: (str(input.currency) ?? "GBP").toUpperCase().slice(0, 3),
    target_price: num(input.target_price),
    raw_text: str(input.raw_text),
    capture_id: isUuid(input.capture_id) ? input.capture_id : null,
  };
  const { data, error } = await db.from("gifts").insert(row).select(GIFT_SELECT).single();
  if (error || !data) throw new Error(`gifts insert failed: ${error?.message ?? "no row"}`);
  return data as unknown as GiftRow;
}

/**
 * A reviewed capture becomes a gift (spec §4.7). The classification carries
 * the extraction, the alias match the writer recorded, and the reviewer's
 * corrections merged over them by the review route. The person is never
 * created here; an unresolved one stays as `for_label`.
 */
export async function createGiftFromClassification(db: SupabaseClient, c: Record<string, unknown>, rawText: string, captureId: string): Promise<GiftRow> {
  const ex: GiftExtraction = giftFromClassification(c, rawText);
  const personId = isUuid(c.gift_person_id) ? (c.gift_person_id as string) : null;
  const occasionId = isUuid(c.gift_occasion_id) ? (c.gift_occasion_id as string) : null;
  return createGift(db, {
    title: ex.title,
    reason: ex.reason,
    for_person_id: personId,
    for_label: personId ? null : ex.person,
    occasion_id: occasionId,
    url: ex.url,
    target_price: ex.target_price,
    origin: "capture",
    raw_text: rawText,
    capture_id: captureId,
  });
}

/** The extraction as the writer first saw it, for the read-back and the stored classification. */
export function extractFromText(text: string): GiftExtraction {
  return extractGiftFromText(text);
}

/** Convert to purchase (spec §8): one-way, purchases row written, gift moved to bought and linked. */
export async function convertGift(db: SupabaseClient, gift: GiftRow, today = todayLondon()): Promise<{ gift: GiftRow; purchase_id: string } | { error: string; status: number }> {
  const problem = canConvert(gift);
  if (problem) return { error: problem, status: 409 };
  const insert = { ...purchaseFromGift(gift, today), raw_capture_id: gift.capture_id ?? null };
  const { data: purchase, error } = await db.from("purchases").insert(insert).select("id").single();
  if (error || !purchase) return { error: `purchase failed: ${error?.message ?? "no row"}`, status: 500 };
  const purchaseId = (purchase as { id: string }).id;
  const { data, error: upErr } = await db
    .from("gifts")
    .update({ status: "bought", purchase_id: purchaseId, paid_amount: gift.paid_amount ?? gift.target_price ?? null, paid_at: gift.paid_at ?? today, updated_at: new Date().toISOString() })
    .eq("id", gift.id)
    .select(GIFT_SELECT)
    .maybeSingle();
  if (upErr || !data) return { error: upErr?.message ?? "update failed", status: 500 };
  await completeReminderTask(db, gift.occasion_id);
  return { gift: data as unknown as GiftRow, purchase_id: purchaseId };
}

/** Marking a gift bought for an occasion completes the reminder task (spec §6). Quiet when there is none. */
export async function completeReminderTask(db: SupabaseClient, occasionId: string | null): Promise<void> {
  if (!occasionId) return;
  const { data } = await db.from("gift_occasions").select("reminder_task_id").eq("id", occasionId).maybeSingle();
  const taskId = (data as { reminder_task_id: string | null } | null)?.reminder_task_id;
  if (!taskId) return;
  try {
    await moveTicket(db, taskId, "done", { forwardOnly: true });
  } catch (err) {
    console.error("[gifts] reminder task not completed:", err);
  }
}

export async function listOccasions(db: SupabaseClient, opts: { includePast?: boolean; includeArchived?: boolean; personId?: string | null; today?: string } = {}): Promise<OccasionRow[]> {
  const today = opts.today ?? todayLondon();
  let q = db.from("gift_occasions").select(OCCASION_SELECT).order("occurs_on", { ascending: true }).limit(500);
  if (!opts.includeArchived) q = q.is("archived_at", null);
  if (!opts.includePast) q = q.gte("occurs_on", today);
  if (opts.personId) q = q.eq("person_id", opts.personId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OccasionRow[];
}
