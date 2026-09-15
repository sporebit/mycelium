/**
 * Run database work AS a specific user, without a browser session.
 *
 * For code that has no cookie to read — cron jobs, the Telegram webhook,
 * Apple Health import, PC metrics, anything admitted by a shared secret —
 * this mints a five-minute user JWT (lib/system/jwt.ts) and hands back a
 * supabase-js client that sends it. PostgREST then applies every RLS policy
 * as that user, so system code can neither read nor write outside the
 * spaces the user could reach themselves. This is the alternative to the
 * service-role client, which bypasses RLS and is fenced to lib/system.
 *
 * Which user? Never from the request. Inbound secret routes resolve their
 * user from configuration (lib/system/bindings.ts); cron jobs iterate the
 * users they serve.
 *
 * Requires SUPABASE_JWT_SECRET (the project's legacy HS256 secret; locally
 * the stack's own JWT secret from `supabase status -o env`).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintUserJwt } from "@/lib/system/jwt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export class MissingJwtSecretError extends Error {
  constructor() {
    super(
      "SUPABASE_JWT_SECRET is not set. System routes cannot act as a user without it; " +
        "add the project's legacy HS256 JWT secret to the environment (names only in docs).",
    );
    this.name = "MissingJwtSecretError";
  }
}

/** A user-scoped client for `userId`, valid for the token's lifetime. */
export async function clientForUser(userId: string): Promise<SupabaseClient> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new MissingJwtSecretError();
  const token = await mintUserJwt({
    sub: userId,
    secret,
    issuer: `${supabaseUrl}/auth/v1`,
  });
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Run `fn` with a client that acts as `userId` under RLS. */
export async function withUser<T>(
  userId: string,
  fn: (db: SupabaseClient) => Promise<T>,
): Promise<T> {
  const db = await clientForUser(userId);
  return fn(db);
}
