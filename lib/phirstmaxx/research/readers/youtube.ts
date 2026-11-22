/**
 * PhirstMaxx research — reading a YouTube link (spec §6 step 1, "YouTube").
 *
 * What it reads: the video's title, channel and thumbnail from YouTube's
 * public oEmbed endpoint (free, no key, always tried); with YOUTUBE_API_KEY
 * also the Data API v3 `videos.list` (part=snippet,recordingDetails): the
 * description and tags for the model stage, and the recording location when
 * the uploader set one.
 *
 * Limits: oEmbed gives no description and no place. The Data API costs one
 * unit of the free 10,000-a-day quota per call. Captions are not read here
 * (the Data API's captions.download needs OAuth as the video's owner), so a
 * video's spoken place names reach the pipeline only through the
 * description. Fallback without a key or when the API is down: the oEmbed
 * title and channel plus the drop's own text; with neither answering, null.
 */
import type { Fact } from "./index";
import { fetchJson, pickFetch, USER_AGENT, type FetchLike } from "./website";

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;

/** The 11-character video id from a watch, youtu.be, shorts, embed, live or /v/ link; null for anything else. */
export function parseYouTubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (HOSTS.test(host)) {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v", "e"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    else if (u.pathname === "/attribution_link") {
      const inner = u.searchParams.get("u");
      return inner ? parseYouTubeId(`https://www.youtube.com${inner}`) : null;
    }
  }
  return id && ID.test(id) ? id : null;
}

export type YouTubeRead = {
  video_id: string;
  watch_url: string;
  title: string | null;
  channel: string | null;
  thumbnail_url: string | null;
  description: string | null;
  tags: string[];
  location: { lat: number; lng: number } | null;
  location_description: string | null;
  /** Which sources answered. */
  sources: Array<"oembed" | "youtube">;
  facts: Fact[];
};

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string };
type VideosList = {
  items?: Array<{
    snippet?: { title?: string; description?: string; channelTitle?: string; tags?: string[]; thumbnails?: Record<string, { url?: string }> };
    recordingDetails?: { location?: { latitude?: number; longitude?: number }; locationDescription?: string };
  }>;
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Read a YouTube link. Null when it is not one, or when neither oEmbed nor the API answered. */
export async function readYouTube(url: string, opts: { apiKey?: string | null; fetch?: FetchLike } = {}): Promise<YouTubeRead | null> {
  const id = parseYouTubeId(url);
  if (!id) return null;
  const f = pickFetch(opts.fetch);
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };

  const [oembed, api] = await Promise.all([
    fetchJson<OEmbed>(f, `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { headers }, 8_000),
    opts.apiKey
      ? fetchJson<VideosList>(f, `https://www.googleapis.com/youtube/v3/videos?part=snippet,recordingDetails&id=${id}&key=${encodeURIComponent(opts.apiKey)}`, { headers }, 10_000)
      : Promise.resolve(null),
  ]);
  const item = api?.items?.[0] ?? null;
  if (!oembed && !item) return null;

  const sources: YouTubeRead["sources"] = [];
  if (oembed) sources.push("oembed");
  if (item) sources.push("youtube");
  const facts: Fact[] = [];
  const add = (key: string, value: unknown, kind: "oembed" | "youtube", confidence: number) => {
    if (value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)) facts.push({ key, value, source_url: watch, source_kind: kind, confidence });
  };

  const snippet = item?.snippet;
  const title = s(snippet?.title) ?? s(oembed?.title);
  const channel = s(snippet?.channelTitle) ?? s(oembed?.author_name);
  const thumbs = snippet?.thumbnails ?? {};
  const thumbnail = s(oembed?.thumbnail_url) ?? s(thumbs.maxres?.url) ?? s(thumbs.high?.url) ?? s(thumbs.default?.url);
  const description = s(snippet?.description);
  const tags = Array.isArray(snippet?.tags) ? snippet.tags.filter((t): t is string => typeof t === "string") : [];
  const loc = item?.recordingDetails?.location;
  const location =
    loc && typeof loc.latitude === "number" && typeof loc.longitude === "number" && Math.abs(loc.latitude) <= 90 && Math.abs(loc.longitude) <= 180 && !(loc.latitude === 0 && loc.longitude === 0)
      ? { lat: loc.latitude, lng: loc.longitude }
      : null;
  const locationDescription = s(item?.recordingDetails?.locationDescription);

  const kind = item ? "youtube" : "oembed";
  add("video_title", title, kind, 0.9);
  add("video_channel", channel, kind, 0.9);
  add("image", thumbnail, oembed?.thumbnail_url ? "oembed" : "youtube", 0.6);
  add("video_description", description, "youtube", 0.9);
  add("video_tags", tags, "youtube", 0.9);
  add("geo", location, "youtube", 0.7);
  add("location_description", locationDescription, "youtube", 0.7);

  return { video_id: id, watch_url: watch, title, channel, thumbnail_url: thumbnail, description, tags, location, location_description: locationDescription, sources, facts };
}
