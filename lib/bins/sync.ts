import { createServerClient } from "@/lib/supabase/server";
import { createEvent, updateEvent, deleteEvent } from "@/lib/google/calendar";
import { isGoogleConnected } from "@/lib/google/sync";
import { loadBinConfig, loadGardenSeasons } from "./config";
import { collectionLabel, getUpcomingCollections, type Collection } from "./schedule";

const TZ = "Europe/London";
const HORIZON_WEEKS = 52;

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const nx = new Date(Date.UTC(y, m - 1, d + 1));
  return nx.toISOString().slice(0, 10);
}

function toGoogleEvent(c: Collection) {
  return {
    summary: collectionLabel(c),
    description: c.gardenIncluded
      ? "Recycling + brown garden waste bin"
      : c.type === "recycling"
        ? "Recycling only (out of garden season)"
        : "Black bin (general waste)",
    start: { date: c.date, timeZone: TZ },
    end: { date: nextDay(c.date), timeZone: TZ },
  };
}

export type BinSyncResult = {
  created: number;
  updated: number;
  removed: number;
  skipped: boolean;
};

/**
 * Push the next HORIZON_WEEKS bin collections to Google Calendar.
 * Idempotent: uses bin_google_events as a journal so re-runs update in place.
 * One-way push — pullFromGoogle explicitly ignores these events (no mapping
 * table row in tasks/events/drops).
 */
export async function syncBinCollectionsToGoogle(
  now: Date = new Date(),
): Promise<BinSyncResult> {
  const result: BinSyncResult = { created: 0, updated: 0, removed: 0, skipped: false };

  if (!(await isGoogleConnected())) {
    result.skipped = true;
    return result;
  }

  const config = await loadBinConfig();
  if (!config) {
    result.skipped = true;
    return result;
  }

  const seasons = await loadGardenSeasons();
  const upcoming = getUpcomingCollections(now, HORIZON_WEEKS, config, seasons);
  const upcomingByDate = new Map(upcoming.map((c) => [c.date, c]));

  const supabase = createServerClient();
  const todayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);

  const { data: journal } = await supabase
    .from("bin_google_events")
    .select("collection_date, google_event_id, event_type")
    .gte("collection_date", todayIso);

  const existing = new Map(
    (journal ?? []).map((r) => [
      r.collection_date as string,
      { id: r.google_event_id as string, type: r.event_type as string },
    ]),
  );

  for (const c of upcoming) {
    const prior = existing.get(c.date);
    const label = collectionLabel(c);
    if (prior) {
      if (prior.type !== label) {
        await updateEvent(prior.id, toGoogleEvent(c));
        await supabase
          .from("bin_google_events")
          .update({ event_type: label, synced_at: new Date().toISOString() })
          .eq("collection_date", c.date);
        result.updated++;
      }
    } else {
      const created = await createEvent(toGoogleEvent(c));
      if (created?.id) {
        await supabase.from("bin_google_events").insert({
          collection_date: c.date,
          google_event_id: created.id,
          event_type: label,
        });
        result.created++;
      }
    }
  }

  for (const [date, prior] of existing) {
    if (upcomingByDate.has(date)) continue;
    await deleteEvent(prior.id);
    await supabase.from("bin_google_events").delete().eq("collection_date", date);
    result.removed++;
  }

  return result;
}
