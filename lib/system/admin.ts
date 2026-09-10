/**
 * Instance-owner operations that must cross user boundaries.
 *
 * RLS makes user_settings owner-only, so the instance owner cannot flip
 * another user's feature flags through the user-scoped client. This is one
 * of the few legitimate uses of the service-role client, and it lives here,
 * behind the lib/system fence, with the check the caller must have already
 * made repeated: the acting user must be the instance owner. It touches
 * exactly the columns listed below and nothing else — it never reads or
 * writes content tables.
 */
import { createServiceClient } from "@/lib/system/serviceClient";

/** The AI-backed capture features (P12 open item A). Default off for new users. */
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

async function assertInstanceOwner(actorId: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("is_instance_owner")
    .eq("id", actorId)
    .maybeSingle();
  if (!data?.is_instance_owner) throw new NotInstanceOwnerError();
}

/**
 * Set feature flags on `targetUserId`'s settings row, acting as `actorId`
 * (who must be the instance owner). Creates the row if the user has none yet
 * (space_id and created_by are set explicitly because the service role has
 * no auth.uid()).
 */
export async function setFeatureFlags(
  actorId: string,
  targetUserId: string,
  flags: FeatureFlags,
): Promise<FeatureFlags> {
  await assertInstanceOwner(actorId);

  const update: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (!isFeatureFlag(k) || typeof v !== "boolean") continue;
    update[k] = v;
  }
  if (Object.keys(update).length === 0) return {};

  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("personal_space_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!profile?.personal_space_id) throw new Error("Target user has no personal space");

  const { data: existing } = await db
    .from("user_settings")
    .select("id")
    .eq("space_id", profile.personal_space_id)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from("user_settings").update(update).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("user_settings").insert({
      ...update,
      space_id: profile.personal_space_id,
      created_by: targetUserId,
    });
    if (error) throw new Error(error.message);
  }
  return update;
}

/** Read a user's feature flags, acting as the instance owner. */
export async function getFeatureFlags(actorId: string, targetUserId: string): Promise<FeatureFlags> {
  await assertInstanceOwner(actorId);
  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("personal_space_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!profile?.personal_space_id) return {};
  const { data } = await db
    .from("user_settings")
    .select(FEATURE_FLAGS.join(", "))
    .eq("space_id", profile.personal_space_id)
    .maybeSingle();
  return (data as FeatureFlags | null) ?? {};
}
