/**
 * Rate limiting through the Postgres token bucket (migration 0114).
 *
 * Keys are chosen by the caller and should name the thing being protected
 * and the dimension: `login:ip:<ip>`, `login:email:<email>`,
 * `invite:user:<uid>`. Buckets are shared by every server instance.
 *
 * Fails open on a database error (logged): a broken limiter must not lock
 * everyone out. Fails closed only on an explicit "no tokens".
 *
 * The bucket function is callable by the service role only (0160). Before
 * that it ran for the public anon key and took the bucket's size from the
 * caller, so anyone could empty or refill another person's sign-in limiter.
 * Every take therefore happens here, on the server, with sizes from LIMITS.
 */
import { createServiceClient } from "./serviceClient";

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
  /** Pairing-code tries from one address (master run §11): an 8-digit code, ten minutes, five tries. */
  wallPair: { capacity: 5, refillPerMinute: 1 } satisfies Bucket,
  /** Quick-unlock tries, per wall and per person: a four-digit PIN must not be walkable from the screen. */
  wallUnlock: { capacity: 6, refillPerMinute: 2 } satisfies Bucket,
} as const;

export async function takeToken(key: string, bucket: Bucket, cost = 1): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("rate_limit_take", {
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
