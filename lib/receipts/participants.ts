import { createServerClient } from "@/lib/supabase/server";

/**
 * Ownership helpers for the split tables.
 *
 * receipt_participants and receipt_line_shares have no user_id of their own —
 * they hang off a receipt, and the receipt is what carries ownership. Every
 * write has to prove the chain up to a receipt belonging to the caller before
 * it touches anything, or an id guessed from elsewhere would be writable.
 */

/** Confirms a receipt belongs to this user. */
export async function ownsReceipt(
  receiptId: string,
  userId: string,
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("receipts")
    .select("id")
    .eq("id", receiptId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Confirms a line belongs to the named receipt and that the receipt belongs to
 * this user, returning what the share maths needs from the line.
 *
 * Both halves matter: checking only the receipt would let a line from another
 * receipt be edited through this one's URL.
 */
export async function lineForShares(
  receiptId: string,
  lineId: string,
  userId: string,
): Promise<{ id: string; line_total: number; quantity: number } | null> {
  const supabase = createServerClient();

  if (!(await ownsReceipt(receiptId, userId))) return null;

  const { data } = await supabase
    .from("receipt_lines")
    .select("id, line_total, quantity")
    .eq("id", lineId)
    .eq("receipt_id", receiptId)
    .maybeSingle<{ id: string; line_total: number; quantity: number }>();

  if (!data) return null;
  return {
    id: data.id,
    line_total: Number(data.line_total) || 0,
    quantity: Number(data.quantity) || 0,
  };
}

/** A person's display name, preferring the explicit one. */
export function personName(p: {
  first_name: string;
  last_name: string | null;
  display_name: string | null;
}): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

/** Looks up display names for a set of people in one round trip. */
export async function namesFor(
  personIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (personIds.length === 0) return names;

  const supabase = createServerClient();
  const { data } = await supabase
    .from("people")
    .select("id, first_name, last_name, display_name")
    .in("id", [...new Set(personIds)]);

  for (const p of (data ?? []) as {
    id: string;
    first_name: string;
    last_name: string | null;
    display_name: string | null;
  }[]) {
    names.set(p.id, personName(p));
  }
  return names;
}
