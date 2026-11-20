/**
 * A capture that is a link becomes a find (master run §12 "in by share"):
 * the share sheet on the phone, a pasted link in the web box, a Telegram
 * message with a URL. The three doors (the pipeline's rule step, the
 * classifier's "find" kind, a review card re-routed to "find") all land
 * here, so a find is kept once however it came in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordFinds } from "./store";
import type { FindRow } from "./types";
import { kindFromHost, linksIn, normaliseUrl, readShare, titleFromUrl } from "./url";
import { queueVerdicts } from "./verdict";

/**
 * Keep the capture's link as a find and queue its verdict. Returns the find
 * (new or already known), or null when the text has no usable link.
 */
export async function findFromCapture(db: SupabaseClient, text: string, opts: { title?: string | null; captureId?: string | null; now?: Date } = {}): Promise<FindRow | null> {
  const share = readShare(text);
  const link = share?.url ?? linksIn(text).map(normaliseUrl).find((u): u is string => !!u) ?? null;
  if (!link) return null;
  const title = (opts.title ?? "").replace(/\s+/g, " ").trim() || share?.title || titleFromUrl(link);
  const kind = share?.kind ?? kindFromHost(link) ?? "other";
  const { inserted } = await recordFinds(db, [{ url: link, title, source: "share", source_ref: null, kind, raw: { text_in: text.slice(0, 600) } }], { now: opts.now, captureId: opts.captureId ?? null });
  if (inserted.length) {
    await queueVerdicts(db, inserted);
    return inserted[0];
  }
  const { data } = await db.from("finds").select("id, url, title, source, source_ref, kind, found_at, raw, verdict, verdict_by, verdicted_at, answer, answered_at, capture_id").eq("url", link).maybeSingle();
  return (data as FindRow | null) ?? null;
}
