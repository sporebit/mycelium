/**
 * The user-scoped Supabase client for server code: server components, route
 * handlers and server actions. It carries the caller's Supabase Auth session
 * from the request cookies, so every query runs under RLS as that user.
 *
 * This is the client the whole app moves to in Part 3. The service-role
 * client (lib/system/serviceClient.ts) bypasses RLS and is fenced off to
 * lib/system/** by ESLint.
 *
 * Always create a fresh client per request; never cache one across requests.
 * In server components Next.js forbids writing cookies, so a token refresh
 * that happens during render cannot be persisted from here — middleware.ts
 * refreshes the session on every request precisely so this case stays rare,
 * and the try/catch keeps a render from throwing when it does occur.
 */
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createUserClient() {
  const cookieStore = await cookies();
  return createSsrServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component: cookies are read-only there.
          // Middleware owns the refresh, so this is safe to ignore.
        }
      },
    },
  });
}
