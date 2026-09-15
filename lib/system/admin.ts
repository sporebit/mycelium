/**
 * Instance-owner feature flags (P12 open item A).
 *
 * The AI-backed capture features default off for new users and are turned
 * on per user by the instance owner. The flags live on user_settings — a
 * content table — so the write goes through admin_set_feature_flags() in
 * migration 0113, a SECURITY DEFINER function confined to the three flag
 * columns. This module never reads or writes a content table itself;
 * lib/access/admin.test.ts asserts that for every admin code path.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FEATURE_FLAGS = [
  "voice_capture_enabled",
  "ai_categorisation_enabled",
  "claude_vision_label_scan_enabled",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlags = Partial<Record<FeatureFlag, boolean>>;

export function isFeatureFlag(key: string): key is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(key);
}

export class NotInstanceOwnerError extends Error {
  constructor() {
    super("Only the instance owner may change another user's feature flags");
    this.name = "NotInstanceOwnerError";
  }
}

function shape(data: unknown): FeatureFlags {
  const out: FeatureFlags = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (isFeatureFlag(k) && typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

/** Read a user's flags as the instance owner (the caller's own client). */
export async function getFeatureFlags(db: SupabaseClient, targetUserId: string): Promise<FeatureFlags> {
  const { data, error } = await db.rpc("admin_get_feature_flags", { p_user: targetUserId });
  if (error) throw new Error(error.message);
  return shape(data);
}

/** Set flags on a user's settings row as the instance owner. */
export async function setFeatureFlags(db: SupabaseClient, targetUserId: string, flags: FeatureFlags): Promise<FeatureFlags> {
  const clean = shape(flags);
  if (Object.keys(clean).length === 0) return {};
  const { data, error } = await db.rpc("admin_set_feature_flags", { p_user: targetUserId, p_flags: clean });
  if (error) {
    if (/instance owner/i.test(error.message)) throw new NotInstanceOwnerError();
    throw new Error(error.message);
  }
  return shape(data);
}
