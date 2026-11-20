/**
 * Quick unlock (master run §11; 0176): a short PIN a person sets for the
 * wall. It is not a password and opens nothing but the wall's view of that
 * person for ten minutes, on a wall that is already paired into their
 * family team. Stored hashed (PBKDF2-SHA-256, a salt a row) in the person's
 * own space; the check runs here with the service role because the wall
 * has no session for the person at the moment it asks. Web Crypto only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./serviceClient";
import { LIMITS, takeToken } from "./rateLimit";

export const PIN_RE = /^\d{4,8}$/;
const ITERATIONS = 100_000;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return hex(new Uint8Array(bits));
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** Set (or replace) the caller's PIN. `db` is the person's own client: the row lands in their space under the owner-only policies. */
export async function setQuickUnlock(db: SupabaseClient, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!PIN_RE.test(pin)) return { ok: false, error: "A PIN is four to eight digits." };
  const salt = newSalt();
  const pin_hash = await hashPin(pin, salt);
  // One row a person (unique on space_id): replace rather than add.
  const { error: del } = await db.from("quick_unlocks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (del) return { ok: false, error: del.message };
  const { error } = await db.from("quick_unlocks").insert({ pin_hash, salt });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function clearQuickUnlock(db: SupabaseClient): Promise<void> {
  await db.from("quick_unlocks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

export async function hasQuickUnlock(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("quick_unlocks").select("id").limit(1);
  return (data?.length ?? 0) > 0;
}

/** Which of these people have a PIN set. Service read: names nothing, returns ids only. */
export async function peopleWithUnlock(uids: readonly string[]): Promise<Set<string>> {
  if (!uids.length) return new Set();
  const { data } = await createServiceClient().from("quick_unlocks").select("created_by").in("created_by", uids);
  return new Set(((data ?? []) as Array<{ created_by: string }>).map((r) => r.created_by));
}

/**
 * Check a PIN for a person from a given wall. Rate-limited per wall and per
 * person, so a visitor at the screen cannot walk the space; a wrong PIN and
 * a person with no PIN answer the same way.
 */
export async function verifyQuickUnlock(deviceId: string, uid: string, pin: string): Promise<"ok" | "wrong" | "throttled"> {
  if (!(await takeToken(`wall-unlock:${deviceId}`, LIMITS.wallUnlock)) || !(await takeToken(`wall-unlock-person:${uid}`, LIMITS.wallUnlock))) return "throttled";
  if (!PIN_RE.test(pin)) return "wrong";
  const { data } = await createServiceClient().from("quick_unlocks").select("pin_hash, salt").eq("created_by", uid).maybeSingle();
  const row = data as { pin_hash: string; salt: string } | null;
  // Hash even when there is no row, so the timing says nothing about who has a PIN.
  const got = await hashPin(pin, row?.salt ?? "no-row");
  if (!row || got.length !== row.pin_hash.length) return "wrong";
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ row.pin_hash.charCodeAt(i);
  return diff === 0 ? "ok" : "wrong";
}
