/**
 * Rate limiting through the Postgres token bucket (migration 0114).
 *
 * Keys are chosen by the caller and should name the thing being protected
 * and the dimension: `login:ip:<ip>`, `login:email:<email>`,
 * `invite:user:<uid>`. Buckets are shared by every server instance.
 *
 * Fails open on a database error (logged): a broken limiter must not lock
 * everyone out. Fails closed only on an explicit "no tokens".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Bucket = { capacity: number; refillPerMinute: number };

export const LIMITS = {
  loginIp: { capacity: 20, refillPerMinute: 10 } satisfies Bucket,
  loginEmail: { capacity: 8, refillPerMinute: 4 } satisfies Bucket,
  magicLinkIp: { capacity: 10, refillPerMinute: 3 } satisfies Bucket,
  magicLinkEmail: { capacity: 4, refillPerMinute: 1 } satisfies Bucket,
  totpVerify: { capacity: 10, refillPerMinute: 5 } satisfies Bucket,
  inviteUser: { capacity: 20, refillPerMinute: 2 } satisfies Bucket,
  /** Ticket writes per user (spec §11) — generous: a bulk clarify is many. */
  ticketWrite: { capacity: 120, refillPerMinute: 60 } satisfies Bucket,
} as const;

/** A client with no session: rate_limit_take is callable by anon. */
export function anonClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function takeToken(db: SupabaseClient, key: string, bucket: Bucket, cost = 1): Promise<boolean> {
  const { data, error } = await db.rpc("rate_limit_take", {
    p_key: key,
    p_capacity: bucket.capacity,
    p_refill_per_minute: bucket.refillPerMinute,
    p_cost: cost,
  });
  if (error) {
    console.error("[rate-limit] failed open:", error.message);
    return true;
  }
  return data === true;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
