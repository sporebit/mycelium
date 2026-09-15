/**
 * The service-role Supabase client. It BYPASSES row level security.
 *
 * Importable only from lib/system/** — eslint.config.mjs enforces this with
 * no-restricted-imports (P12 Global Rule 5). Everything else uses the
 * user-scoped client from lib/supabase/user.ts, so that RLS is the wall and
 * app code is UX. System helpers that must act for a specific user without
 * a browser session (cron, webhooks, imports) go through lib/system/withUser
 * from Part 3, which mints a short-lived user JWT rather than using this.
 *
 * The only callers today are lib/system/admin.ts (instance-owner feature
 * flags) and, from Part 5 on, the audit writer and remote sign-out.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
