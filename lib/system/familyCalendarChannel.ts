/**
 * The one service-role read the Family calendar's push webhook needs
 * (app/api/google/push): find the sync row by the channel Google names in
 * its headers, and only hand it over when the secret token matches. The
 * webhook has no session (Google is the caller), so RLS cannot place it; the
 * match on channel id AND token is what stands in for one. Nothing else is
 * read, and the pull that follows runs as the connection's owner.
 */
import { createServiceClient } from "./serviceClient";
import type { SyncRow } from "@/lib/family/calendar/sync";

export async function syncRowForChannel(channelId: string, token: string): Promise<SyncRow | null> {
  const { data } = await createServiceClient()
    .from("family_calendar_sync")
    .select("id, space_id, calendar_id, calendar_summary, owner_user_id, sync_token, last_synced_at, last_sync_error, last_sync_error_at, channel_id, channel_resource_id, channel_token, channel_expires_at, channel_error, google_reminders, health_checked_at, health_ok, health_error, health_nudged_on, updated_at")
    .eq("channel_id", channelId)
    .maybeSingle();
  const row = (data as SyncRow | null) ?? null;
  if (!row || !row.channel_token || row.channel_token !== token || !row.owner_user_id || !row.calendar_id) return null;
  return row;
}
