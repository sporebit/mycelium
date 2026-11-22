/**
 * PhirstMaxx research — reading a web page (spec §6 step 1, "Website").
 *
 * What it reads: one public page, fetched once. From it: the <title>,
 * OpenGraph and Twitter meta, every schema.org JSON-LD block, and a crude
 * readable text for the model stage. Place / LocalBusiness / Event JSON-LD
 * gives name, address, geo, phone, price range and opening hours without
 * any AI, so those facts come out here with source_kind "jsonld" (0.85);
 * OpenGraph gives only a title, description and picture ("opengraph", 0.5).
 *
 * Service: none but the site itself; no key, no cost. Limits: 12 s timeout,
 * 1 MB of body (the rest is cut off, which loses late JSON-LD on very heavy
 * pages), UTF-8 only, no JavaScript run, so a page that builds itself in
 * the browser yields little. A non-HTML answer (a PDF, an image) gives the
 * minimal result from the URL alone. Fallback when the page gives nothing:
 * the drop's own text and the later stages (geocode, OSM, Places, search).
 *
 * The shared fetch helpers (injectable fetch, timeout, body cap) live here
 * and the other readers import them; nothing here throws across the module
 * boundary, failures come back as null.
 */
import type { SourceKind } from "@/lib/phirstmaxx/types";
import type { Fact } from "./index";
import { fromOsm, fromSchemaOrg, type WeeklyHours } from "./hours";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The only User-Agent this pipeline sends: no owner name, email or project. */
export const USER_AGENT = "Mycelium/1.0 (self-hosted planner)";
export const HTML_CAP_BYTES = 1_000_000;

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
export const pickFetch = (f?: FetchLike): FetchLike => f ?? defaultFetch;

export type Fetched = { res: Response; bytes: Uint8Array; truncated: boolean; url: string };

/**
 * One outside call with a timeout that covers the body as well as the
 * headers, and a cap on how much body is read. Null on a network failure,
 * an abort or a non-2xx answer; never throws.
 */
export async function fetchCapped(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxBytes?: number; allowStatus?: (status: number) => boolean } = {},
): Promise<Fetched | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  const max = opts.maxBytes ?? HTML_CAP_BYTES;
  try {
    const res = await fetchImpl(url, { redirect: "follow", credentials: "omit", ...init, signal: ctrl.signal });
    if (!res.ok && !(opts.allowStatus?.(res.status) ?? false)) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (total + value.byteLength > max) {
          chunks.push(value.subarray(0, max - total));
          total = max;
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
        total += value.byteLength;
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      truncated = buf.byteLength > max;
      chunks.push(truncated ? buf.subarray(0, max) : buf);
      total = Math.min(buf.byteLength, max);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    return { res, bytes, truncated, url: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const utf8 = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

/** fetchCapped, then JSON.parse. Null on any failure, including bad JSON. */
export async function fetchJson<T>(fetchImpl: FetchLike, url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T | null> {
  const got = await fetchCapped(fetchImpl, url, init, { timeoutMs, maxBytes: 2_000_000 });
  if (!got || got.truncated) return null;
  try {
    return JSON.parse(utf8(got.bytes)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML pieces, hand-rolled (no DOM on the server, no new dependency).

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", pound: "£", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** Every <meta> with a property/name/itemprop and a content, first one wins, keys lower-cased. */
export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attributes(tag);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase().trim();
    const content = (a.content ?? "").trim();
    if (key && content && !(key in out)) out[key] = content;
  }
  return out;
}

export type JsonLdThing = Record<string, unknown>;

/** Every application/ld+json block, parsed, with arrays and @graph flattened. Bad blocks are skipped. */
export function jsonLdBlocks(html: string): JsonLdThing[] {
  const out: JsonLdThing[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  const push = (v: unknown, depth: number) => {
    if (depth > 4 || !v) return;
    if (Array.isArray(v)) {
      for (const x of v) push(x, depth + 1);
      return;
    }
    if (typeof v !== "object") return;
    const o = v as JsonLdThing;
    if (Array.isArray(o["@graph"])) push(o["@graph"], depth + 1);
    if (o["@type"]) out.push(o);
  };
  while ((m = re.exec(html))) {
    if (!/type\s*=\s*["']?application\/ld\+json/i.test(m[1])) continue;
    const body = m[2].replace(/^\s*(<!--|<!\[CDATA\[)/, "").replace(/(-->|\]\]>)\s*$/, "").trim();
    try {
      push(JSON.parse(body), 0);
    } catch {
      // A broken block on someone else's site is not our failure; skip it.
    }
  }
  return out;
}

/** Crude readable text: no head, scripts, styles, nav, header, footer; tags to spaces; whitespace collapsed; first 4000 characters. */
export function readableText(html: string, max = 4000): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(head|script|style|noscript|nav|header|footer|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body).replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// JSON-LD → facts.

const PLACE_TYPES = new Set([
  "place", "localbusiness", "touristattraction", "touristdestination", "event", "restaurant", "park", "museum", "zoo", "aquarium",
  "amusementpark", "landmarksorhistoricalbuildings", "civicstructure", "beach", "campground", "playground", "artgallery",
  "foodestablishment", "cafeorcoffeeshop", "barorpub", "bakery", "store", "entertainmentbusiness", "sportsactivitylocation",
  "lodgingbusiness", "hotel", "performingartstheater", "movietheater", "library", "placeofworship", "church", "farm", "garden",
  "naturereserve", "festival", "musicevent", "sportsevent", "theaterevent", "exhibitionevent", "childrensevent", "socialevent",
  "foodevent", "eventseries", "educationevent", "comedyevent", "danceevent", "screeningevent", "visualartsevent",
]);

const typesOf = (o: JsonLdThing): string[] => {
  const t = o["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.replace(/^.*[/#]/, ""));
};

const isEventType = (types: string[]) => types.some((t) => /event$/i.test(t) || t === "Festival" || t === "EventSeries");

export function isPlaceLike(o: JsonLdThing): boolean {
  const types = typesOf(o);
  return types.some((t) => PLACE_TYPES.has(t.toLowerCase()) || /(Business|Store|Restaurant|Shop|Attraction|Event)$/.test(t));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? decodeEntities(v.trim()) : typeof v === "number" ? String(v) : null);

/** PostalAddress (or a plain string) → one line. */
export function addressLine(a: unknown): string | null {
  if (typeof a === "string") return str(a);
  if (Array.isArray(a)) return addressLine(a[0]);
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const country = o.addressCountry && typeof o.addressCountry === "object" ? (o.addressCountry as Record<string, unknown>).name : o.addressCountry;
  const parts = [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode, country].map(str).filter((p): p is string => !!p);
  const seen = new Set<string>();
  const line = parts.filter((p) => (seen.has(p.toLowerCase()) ? false : (seen.add(p.toLowerCase()), true))).join(", ");
  return line || null;
}

export function geoOf(g: unknown): { lat: number; lng: number } | null {
  if (Array.isArray(g)) return geoOf(g[0]);
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const lat = Number(o.latitude);
  const lng = Number(o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  if (o.latitude === undefined || o.longitude === undefined || o.latitude === "" || o.longitude === "") return null;
  return { lat, lng };
}

function hoursOf(o: JsonLdThing): WeeklyHours | null {
  const spec = fromSchemaOrg(o.openingHoursSpecification);
  if (spec) return spec;
  const oh = o.openingHours;
  const text = Array.isArray(oh) ? oh.filter((x) => typeof x === "string").join("; ") : typeof oh === "string" ? oh : null;
  return text ? fromOsm(text) : null;
}

/** Facts from one place-like JSON-LD node (Event location included). */
export function jsonLdFacts(node: JsonLdThing, sourceUrl: string | null): Fact[] {
  const facts: Fact[] = [];
  const kind: SourceKind = "jsonld";
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    facts.push({ key, value, source_url: sourceUrl, source_kind: kind, confidence: 0.85 });
  };
  const types = typesOf(node);
  add("schema_type", types.join(", ") || null);
  add("name", str(node.name));
  add("description", str(node.description));
  add("url", str(node.url));
  add("telephone", str(node.telephone));
  add("price_range", str(node.priceRange));
  if (isEventType(types)) {
    add("event_start", str(node.startDate));
    add("event_end", str(node.endDate));
    const loc = Array.isArray(node.location) ? node.location[0] : node.location;
    if (typeof loc === "string") add("event_location", str(loc));
    else if (loc && typeof loc === "object") {
      const l = loc as JsonLdThing;
      add("event_location", str(l.name) ?? addressLine(l.address));
      add("address", addressLine(l.address));
      add("geo", geoOf(l.geo));
      add("opening_hours", hoursOf(l));
    }
  }
  add("address", facts.some((f) => f.key === "address") ? null : addressLine(node.address));
  add("geo", facts.some((f) => f.key === "geo") ? null : geoOf(node.geo));
  add("opening_hours", facts.some((f) => f.key === "opening_hours") ? null : hoursOf(node));
  return facts;
}

// ---------------------------------------------------------------------------

export type WebsiteRead = {
  final_url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  text: string;
  jsonld: JsonLdThing[];
  facts: Fact[];
  /** The body was longer than 1 MB and was cut off. */
  truncated: boolean;
  /** The answer was not HTML; only the URL was used. */
  not_html: boolean;
};

function absolute(u: string | null, base: string): string | null {
  if (!u) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function minimal(url: string, contentType: string): WebsiteRead {
  let host: string | null = null;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = null;
  }
  return { final_url: url, title: null, description: null, image: /^image\//i.test(contentType) ? url : null, site_name: host, text: "", jsonld: [], facts: [], truncated: false, not_html: true };
}

/** Parse an HTML string already fetched (exported for the social reader and tests). */
export function parseHtml(html: string, finalUrl: string): Omit<WebsiteRead, "truncated" | "not_html"> {
  const meta = metaTags(html);
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const docTitle = titleTag ? decodeEntities(titleTag[1]).replace(/\s+/g, " ").trim() || null : null;
  const title = meta["og:title"] ?? meta["twitter:title"] ?? docTitle;
  const description = meta["og:description"] ?? meta["twitter:description"] ?? meta.description ?? null;
  const image = absolute(meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? meta["twitter:image:src"] ?? null, finalUrl);
  const siteName = meta["og:site_name"] ?? null;
  const jsonld = jsonLdBlocks(html);

  const facts: Fact[] = [];
  const primary = jsonld.find(isPlaceLike);
  if (primary) facts.push(...jsonLdFacts(primary, finalUrl));
  const og = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") facts.push({ key, value, source_url: finalUrl, source_kind: "opengraph", confidence: 0.5 });
  };
  og("name", title);
  og("description", description);
  og("image", image);
  og("site_name", siteName);
  const lat = Number(meta["place:location:latitude"] ?? meta["og:latitude"]);
  const lng = Number(meta["place:location:longitude"] ?? meta["og:longitude"]);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (meta["place:location:latitude"] ?? meta["og:latitude"])) og("geo", { lat, lng });

  return { final_url: finalUrl, title, description, image, site_name: siteName, text: readableText(html), jsonld, facts };
}

/**
 * Read one page. Null when the URL is not http(s), the site cannot be
 * reached, or it answers with an error; the minimal URL-only result when it
 * answers with something other than HTML.
 */
export async function readWebsite(url: string, fetchImpl?: FetchLike): Promise<WebsiteRead | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const got = await fetchCapped(pickFetch(fetchImpl), parsed.toString(), {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
      "User-Agent": USER_AGENT,
    },
  });
  if (!got) return null;
  const type = got.res.headers.get("content-type") ?? "";
  const head = utf8(got.bytes.subarray(0, 512)).trimStart().toLowerCase();
  const looksHtml = /html|xml/i.test(type) || (!type && (head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<")));
  if (!looksHtml) return minimal(got.url, type);
  return { ...parseHtml(utf8(got.bytes), got.url), truncated: got.truncated, not_html: false };
}
