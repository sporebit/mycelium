/**
 * Browser-side Supabase client, session stored in cookies so the server
 * (middleware, server components, route handlers) sees the same session.
 *
 * Built on @supabase/ssr rather than a bare createClient: the bare client
 * keeps its session in localStorage, which the server cannot read, so a
 * sign-in on the client would leave every server request unauthenticated.
 *
 * Passkeys are opt-in in supabase-js (experimental); the flag is set here
 * so /login and the security settings can call signInWithPasskey(),
 * registerPasskey() and auth.passkey.*.
 *
 * Subject to RLS — only sees what policies allow for the signed-in user.
 */
import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createBrowserClient() {
  return createSsrBrowserClient(supabaseUrl, anonKey, {
    auth: { experimental: { passkey: true } },
  });
}
