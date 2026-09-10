/**
 * The user-scoped Supabase client for server code: server components, route
 * handlers and server actions. Every query runs under RLS as the calling
 * principal, which middleware.ts has already established:
 *
 *   x-principal = user         → the browser session in the cookies.
 *   x-principal = system       → API_SECRET (acts as Phil) or CRON_SECRET
 *                                (acts as nobody: cron jobs choose their
 *                                users with lib/system/withUser).
 *   x-principal = break_glass  → the dormant emergency path, acts as Phil.
 *
 * For the two non-session principals that name a user (x-principal-user),
 * a five-minute user JWT is minted with SUPABASE_JWT_SECRET and sent instead
 * of cookies, so the same RLS applies. Route code never needs to know which
 * path it got. Routes in PUBLIC_PREFIXES (Telegram webhook, health import,
 * the public crons) receive no principal at all and must use withUser().
 *
 * The service-role client (lib/system/serviceClient.ts) bypasses RLS and is
 * fenced to lib/system/** by ESLint.
 *
 * Always create a fresh client per request; never cache one across requests.
 * In server components Next.js forbids writing cookies, so a token refresh
 * during render cannot be persisted from here — middleware refreshes the
 * session on every request precisely so that case stays rare, and the
 * try/catch keeps a render from throwing when it does occur.
 */
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { PRINCIPAL_HEADER, PRINCIPAL_PATH_HEADER, PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { auditBreakGlass } from "@/lib/system/audit";
import { clientForUser } from "@/lib/system/withUser";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createUserClient(): Promise<SupabaseClient> {
  const h = await headers();
  const principal = h.get(PRINCIPAL_HEADER);
  const principalUser = h.get(PRINCIPAL_USER_HEADER);
  if ((principal === "system" || principal === "break_glass") && principalUser) {
    if (principal === "break_glass") {
      // One audit row per break-glass request (P12 Part 5 resolves Part 1's TODO).
      auditBreakGlass(principalUser, h.get(PRINCIPAL_PATH_HEADER) ?? "?", h);
    }
    return clientForUser(principalUser);
  }

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
