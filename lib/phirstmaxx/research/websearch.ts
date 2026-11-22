/**
 * PhirstMaxx research — the web-search-grounded model call (spec §6 step 3,
 * the last source in the order: JSON-LD → OSM → Google Places → this).
 *
 * The same shape as lib/quotes/research.ts: one Messages API call with the
 * web_search tool (at most three searches) asking for facts about a place
 * as JSON, every fact with the URL it was read from. A fact with no URL, a
 * URL that is not a link, or a URL on a site the search never showed the
 * model, is dropped: uncited claims are not facts (spec §6.3). Every kept
 * fact is source_kind "web_search" with the model's confidence capped at
 * 0.7, so a hand edit or a JSON-LD fact always outranks it.
 *
 * Paid: the pipeline gates every call on the research spend rule (spec
 * §11.5). The cost comes back for the research run and api_usage.
 */
import { costPence } from "@/lib/ai/usage";
import { FEATURE_HEADER, RECORDED_HEADER } from "@/lib/ai/meterRules";
import { MODEL_CHAT } from "@/lib/config/models";
import type { Fact } from "./readers";

export const WEBSEARCH_TAG = "phirstmaxx.research.websearch";
export const WEBSEARCH_MAX_USES = 3;
/** USD per web search, as billed. */
export const SEARCH_USD = 0.01;

/** The keys the model may fill, and the shape each value takes. */
export const WEBSEARCH_KEYS: Record<string, "string" | "number" | "boolean" | "string[]" | "minutes" | "price" | "dog_rule" | "booking" | "parking"> = {
  summary: "string",
  kind: "string",
  tags: "string[]",
  typical_minutes: "minutes",
  best_time_of_day: "string[]",
  seasons: "string[]",
  best_times_note: "string",
  price: "price",
  booking: "booking",
  parking: "parking",
  dog_rule: "dog_rule",
  toilets: "boolean",
  food: "boolean",
  step_free: "boolean",
  indoor: "boolean",
  weather_dependent: "boolean",
  opening_hours_text: "string",
  last_entry: "string",
  website: "string",
  address: "string",
  telephone: "string",
};

const TIMES = new Set(["morning", "afternoon", "evening", "night"]);
const SEASONS = new Set(["spring", "summer", "autumn", "winter"]);
const DOG = new Set(["yes", "no", "outside_only", "unknown"]);

export const WEBSEARCH_SYSTEM = [
  "You research one place or activity in Great Britain for two people planning a day out. British English.",
  "Use web search (at most 3 searches): the official site first, then one or two others. Only state what a page you saw says, and give that page's URL with every fact. Never invent a URL, a price or an opening time.",
  "Respond with ONLY a JSON object: {\"facts\": [{\"key\": string, \"value\": any, \"url\": string, \"confidence\": number}]}.",
  "Keys and value shapes:",
  "  summary (string, two sentences on what it is and why go), kind (one of: walk, hike, beach, garden, park, museum, gallery, castle, historic, food, pub, cafe, market, event, theatre, cinema, activity, night_sky, swim, wildlife, viewpoint, shop, other), tags (string[]),",
  "  typical_minutes ({\"min\": number, \"max\": number} time people spend there), best_time_of_day (string[] of morning|afternoon|evening|night), seasons (string[] of spring|summer|autumn|winter; empty if any), best_times_note (string: tide, sunset, dark-sky, school holidays, one-off dates),",
  "  price ({\"adult_pence\": number|null, \"child_pence\": number|null, \"free\": boolean, \"note\": string|null}), booking ({\"needed\": boolean, \"how\": string|null, \"ahead\": string|null}), parking ({\"available\": boolean, \"cost_note\": string|null}),",
  "  dog_rule (yes|no|outside_only|unknown), toilets (boolean), food (boolean), step_free (boolean), indoor (boolean), weather_dependent (boolean), opening_hours_text (string, by day and season as written), last_entry (string), website (string), address (string), telephone (string).",
  "confidence is 0 to 1 for each fact. Leave out anything you did not find; an empty facts list is a fine answer.",
].join("\n");

const str = (v: unknown, max = 600): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const strs = (v: unknown, allowed?: Set<string>, max = 12): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")).filter((x) => x && (!allowed || allowed.has(x)));
  return out.length ? [...new Set(out)].slice(0, max) : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A fact's value in the shape its key takes, or null when it does not fit. */
export function shapeValue(key: string, raw: unknown): unknown {
  switch (WEBSEARCH_KEYS[key]) {
    case "string":
      return str(raw);
    case "number":
      return num(raw);
    case "boolean":
      return bool(raw);
    case "string[]":
      return strs(raw, key === "best_time_of_day" ? TIMES : key === "seasons" ? SEASONS : undefined);
    case "minutes": {
      const o = obj(raw);
      const min = num(o?.min);
      const max = num(o?.max);
      if (min === null && max === null) return null;
      const lo = Math.max(5, Math.round(min ?? (max as number)));
      const hi = Math.max(lo, Math.round(max ?? lo));
      return { min: lo, max: hi };
    }
    case "price": {
      const o = obj(raw);
      if (!o) return null;
      const adult = num(o.adult_pence);
      const child = num(o.child_pence);
      const free = bool(o.free);
      if (adult === null && child === null && free === null) return null;
      return { adult_pence: adult === null ? null : Math.max(0, Math.round(adult)), child_pence: child === null ? null : Math.max(0, Math.round(child)), free: free ?? adult === 0, note: str(o.note, 200) };
    }
    case "dog_rule": {
      const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return DOG.has(s) ? s : null;
    }
    case "booking": {
      const o = obj(raw);
      const needed = bool(o?.needed);
      return needed === null ? null : { needed, how: str(o?.how, 200), ahead: str(o?.ahead, 100) };
    }
    case "parking": {
      const o = obj(raw);
      const available = bool(o?.available);
      return available === null ? null : { available, cost_note: str(o?.cost_note, 200) };
    }
    default:
      return null;
  }
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The model's JSON → facts. `seenUrls` are the pages the search tool
 * showed it; when the set is not empty a fact's URL must be on one of
 * those hosts, otherwise the citation is taken on trust as a link only.
 * Exported for tests.
 */
export function factsFromModelJson(text: string, seenUrls: readonly string[] = []): Fact[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return [];
  }
  const list = Array.isArray(o.facts) ? o.facts : [];
  const hosts = new Set(seenUrls.map(hostOf).filter((h): h is string => !!h));
  const out: Fact[] = [];
  const seenKeys = new Set<string>();
  for (const raw of list) {
    const f = obj(raw);
    if (!f || typeof f.key !== "string" || !(f.key in WEBSEARCH_KEYS)) continue;
    const url = str(f.url, 1000);
    const host = url ? hostOf(url) : null;
    if (!url || !host) continue;
    if (hosts.size > 0 && !hosts.has(host)) continue;
    const value = shapeValue(f.key, f.value);
    if (value === null || value === undefined) continue;
    if (seenKeys.has(f.key)) continue;
    seenKeys.add(f.key);
    const conf = num(f.confidence);
    out.push({ key: f.key, value, source_url: url, source_kind: "web_search", confidence: Math.min(0.7, Math.max(0.1, conf ?? 0.5)) });
  }
  return out;
}

/** Every URL in the search tool's result blocks, so citations can be checked against what the model was shown. */
export function urlsFromContent(content: ReadonlyArray<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const inner = block.content;
    if (!Array.isArray(inner)) continue;
    for (const r of inner) {
      const u = obj(r)?.url;
      if (typeof u === "string") out.push(u);
    }
  }
  return out;
}

export type WebSearchInput = { name: string; address?: string | null; town?: string | null; hint?: string | null };
export type WebSearchResult = { facts: Fact[]; model: string; input_tokens: number; output_tokens: number; searches: number; cost_pence: number };

export async function webSearchFacts(input: WebSearchInput, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<WebSearchResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.name.trim()) return null;
  const model = MODEL_CHAT;
  const f = opts.fetch ?? globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 55_000);
  const user = [`Place: ${input.name.trim()}`, input.address ? `Address: ${input.address}` : "", input.town ? `Area: ${input.town}` : "", input.hint ? `What the person shared: ${input.hint.slice(0, 800)}` : ""].filter(Boolean).join("\n");
  try {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", [FEATURE_HEADER]: WEBSEARCH_TAG, [RECORDED_HEADER]: "1" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: WEBSEARCH_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: WEBSEARCH_MAX_USES }],
        messages: [{ role: "user", content: user }],
      }),
    });
    const j = (await res.json()) as {
      content?: Array<Record<string, unknown> & { type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(j.error?.message ?? `anthropic ${res.status}`);
    const content = j.content ?? [];
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    const facts = factsFromModelJson(text, urlsFromContent(content));
    const input_tokens = j.usage?.input_tokens ?? 0;
    const output_tokens = j.usage?.output_tokens ?? 0;
    const searches = j.usage?.server_tool_use?.web_search_requests ?? 0;
    return { facts, model, input_tokens, output_tokens, searches, cost_pence: costPence(model, input_tokens, output_tokens, searches * SEARCH_USD) };
  } catch (err) {
    console.error("[phirstmaxx/websearch] failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
