/**
 * @deprecated Transitional shim. The service-role client now lives in
 * lib/system/serviceClient.ts and may only be imported from lib/system/**.
 *
 * Every existing call site of createServerClient() bypasses RLS. Part 3 of
 * the multi-user work replaces each one with createUserClient() from
 * lib/supabase/user.ts (browser sessions) or lib/system/withUser (system
 * routes acting for a configured user), then deletes this file and its
 * exception in eslint.config.mjs. Do not add new imports of this module.
 */
import { createServiceClient } from "@/lib/system/serviceClient";

/** @deprecated Use createUserClient() (or withUser in lib/system) instead. */
export function createServerClient() {
  return createServiceClient();
}
