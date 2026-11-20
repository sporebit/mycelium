/**
 * The live AI model list (MYC-190, Stream H harvest).
 *
 * Once a day the tick asks each provider the app has a key for what models
 * it offers (Anthropic's and OpenAI's models endpoints; list calls cost
 * nothing and the meter lets them through unmetered) and keeps the answer
 * in ai_models (0177) with first-seen and last-seen dates. A model a
 * successful fetch no longer lists is marked retired: a fact the app saw,
 * not a guess. A provider that could not be reached retires nothing.
 *
 * Two nudges, each once per model, inside the day's interruption budget and
 * to the instance owner only: a new model (one message per provider, so a
 * batch of snapshots is one line, not ten), and a retired model that is
 * still pinned somewhere (the environment's roles, the capture classifier,
 * the two per-person choices in Settings). The first fetch for a provider
 * is the baseline and nudges nothing.
 *
 * Nothing here chooses a model. Settings offers only the models priced in
 * lib/config/models.ts, and nothing switches on its own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT, MODEL_FAST, MODEL_VISION, type Provider } from "@/lib/config/models";
import { interrupt } from "@/lib/nudges/interrupt";
import { createServiceClient } from "./serviceClient";
import { withUser } from "./withUser";

export type SeenModel = {
  provider: Provider;
  model_id: string;
  display_name: string | null;
  released_at: string | null;
  raw: Record<string, unknown>;
};

export type StoredModel = SeenModel & {
  first_seen: string;
  last_seen: string;
  retired_at: string | null;
  nudged_new_at: string | null;
  nudged_retired_at: string | null;
};

export type ProviderReport = {
  ok: boolean;
  error?: string;
  /** The first fetch for this provider: everything is new and nothing is nudged. */
  baseline?: boolean;
  seen: number;
  added: string[];
  retired: string[];
  returned: string[];
};

export type RefreshReport = {
  at: string;
  providers: Partial<Record<Provider, ProviderReport>>;
  pinned: string[];
  nudges: Array<{ about: "new" | "retired_pinned"; provider?: Provider; models: string[]; sent: boolean; reason?: string }>;
};

const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Anthropic", openai: "OpenAI" };

// ---------------------------------------------------------------------------
// The providers' lists
// ---------------------------------------------------------------------------

type AnthropicPage = { data?: Array<{ id: string; display_name?: string; created_at?: string }>; has_more?: boolean; last_id?: string };
type OpenAiList = { data?: Array<{ id: string; created?: number; owned_by?: string }> };

/** GET https://api.anthropic.com/v1/models, following the pages. */
export async function fetchAnthropicModels(key: string, fetchImpl: typeof fetch = fetch): Promise<SeenModel[]> {
  const out: SeenModel[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "1000");
    if (after) url.searchParams.set("after_id", after);
    const res = await fetchImpl(url, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (!res.ok) throw new Error(`anthropic models: HTTP ${res.status}`);
    const body = (await res.json()) as AnthropicPage;
    for (const m of body.data ?? []) {
      out.push({ provider: "anthropic", model_id: m.id, display_name: m.display_name ?? null, released_at: m.created_at ?? null, raw: m as Record<string, unknown> });
    }
    if (!body.has_more || !body.last_id) break;
    after = body.last_id;
  }
  return out;
}

/** GET https://api.openai.com/v1/models (one page). */
export async function fetchOpenAiModels(key: string, fetchImpl: typeof fetch = fetch): Promise<SeenModel[]> {
  const res = await fetchImpl("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`openai models: HTTP ${res.status}`);
  const body = (await res.json()) as OpenAiList;
  return (body.data ?? []).map((m) => ({
    provider: "openai" as const,
    model_id: m.id,
    display_name: null,
    released_at: typeof m.created === "number" ? new Date(m.created * 1000).toISOString() : null,
    raw: m as Record<string, unknown>,
  }));
}

// ---------------------------------------------------------------------------
// Reconciling what was seen with what is stored (pure)
// ---------------------------------------------------------------------------

export type Reconciled = { rows: StoredModel[]; added: string[]; retired: string[]; returned: string[] };

/**
 * The rows to write for one provider after a successful fetch: every seen
 * model (new ones first-seen now, known ones last-seen now, a retired one
 * that is back un-retired), and every stored model the fetch did not list
 * marked retired now. Models already retired stay as they are.
 */
export function reconcile(stored: StoredModel[], seen: SeenModel[], now: Date): Reconciled {
  const at = now.toISOString();
  const byId = new Map(stored.map((r) => [r.model_id, r]));
  const seenIds = new Set<string>();
  const rows: StoredModel[] = [];
  const added: string[] = [];
  const retired: string[] = [];
  const returned: string[] = [];

  for (const m of seen) {
    if (seenIds.has(m.model_id)) continue;
    seenIds.add(m.model_id);
    const have = byId.get(m.model_id);
    if (!have) {
      added.push(m.model_id);
      rows.push({ ...m, first_seen: at, last_seen: at, retired_at: null, nudged_new_at: null, nudged_retired_at: null });
      continue;
    }
    if (have.retired_at) returned.push(m.model_id);
    rows.push({
      ...have,
      display_name: m.display_name ?? have.display_name,
      released_at: m.released_at ?? have.released_at,
      raw: m.raw,
      last_seen: at,
      retired_at: null,
      // Back from retirement: a later retirement is news again.
      nudged_retired_at: have.retired_at ? null : have.nudged_retired_at,
    });
  }
  for (const have of stored) {
    if (seenIds.has(have.model_id) || have.retired_at) continue;
    retired.push(have.model_id);
    rows.push({ ...have, retired_at: at });
  }
  return { rows, added, retired, returned };
}

/** Everything a model id is pinned to: the environment's roles and the owner's two Settings choices. */
export function pinnedModels(settings: Record<string, unknown> | null | undefined, env: NodeJS.ProcessEnv = process.env): string[] {
  const ids = [
    MODEL_CHAT,
    MODEL_FAST,
    MODEL_VISION,
    env.OPENAI_CLASSIFIER_MODEL,
    settings?.anthropic_model,
    settings?.ai_spending_categorisation_model,
  ];
  return [...new Set(ids.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()))];
}

/** One line per provider: "New Anthropic model: x" or "New OpenAI models: a, b, c and 4 more". */
export function newModelsTitle(provider: Provider, ids: string[]): string {
  const shown = ids.slice(0, 4);
  const rest = ids.length - shown.length;
  return `New ${PROVIDER_LABEL[provider]} model${ids.length === 1 ? "" : "s"}: ${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
}

export function retiredPinnedTitle(ids: string[]): string {
  return `Retired AI model${ids.length === 1 ? "" : "s"} still pinned: ${ids.join(", ")}`;
}

// ---------------------------------------------------------------------------
// The daily refresh
// ---------------------------------------------------------------------------

export type RefreshOptions = {
  now?: Date;
  fetchImpl?: typeof fetch;
  keys?: Partial<Record<Provider, string | undefined>>;
  db?: SupabaseClient;
};

const FETCHERS: Record<Provider, (key: string, f: typeof fetch) => Promise<SeenModel[]>> = {
  anthropic: fetchAnthropicModels,
  openai: fetchOpenAiModels,
};

export async function refreshAiModels(opts: RefreshOptions = {}): Promise<RefreshReport> {
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const keys = opts.keys ?? { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
  const svc = opts.db ?? createServiceClient();
  const report: RefreshReport = { at: now.toISOString(), providers: {}, pinned: [], nudges: [] };

  const addedBy: Partial<Record<Provider, string[]>> = {};
  for (const provider of ["anthropic", "openai"] as Provider[]) {
    const key = keys[provider]?.trim();
    if (!key) {
      report.providers[provider] = { ok: false, error: "no key", seen: 0, added: [], retired: [], returned: [] };
      continue;
    }
    let seen: SeenModel[];
    try {
      seen = await FETCHERS[provider](key, fetchImpl);
    } catch (err) {
      // Not reachable today: retire nothing, say so.
      report.providers[provider] = { ok: false, error: err instanceof Error ? err.message : String(err), seen: 0, added: [], retired: [], returned: [] };
      continue;
    }
    const { data: storedRows, error: readErr } = await svc.from("ai_models").select("*").eq("provider", provider).limit(5000);
    if (readErr) throw new Error(`ai_models read: ${readErr.message}`);
    const stored = (storedRows ?? []) as StoredModel[];
    const baseline = stored.length === 0;
    const r = reconcile(stored, seen, now);
    if (r.rows.length > 0) {
      const { error } = await svc.from("ai_models").upsert(r.rows, { onConflict: "provider,model_id" });
      if (error) throw new Error(`ai_models write: ${error.message}`);
    }
    report.providers[provider] = { ok: true, baseline, seen: seen.length, added: r.added, retired: r.retired, returned: r.returned };
    if (!baseline) addedBy[provider] = r.added;
  }

  // The nudges go to the instance owner, as the owner, inside their budget.
  const { data: owner } = await svc.from("profiles").select("id").eq("is_instance_owner", true).is("disabled_at", null).limit(1).maybeSingle();
  const ownerId = (owner as { id: string } | null)?.id;
  if (!ownerId) return report;

  await withUser(ownerId, async (db) => {
    const { data: settings } = await db.from("user_settings").select("anthropic_model, ai_spending_categorisation_model").limit(1).maybeSingle();
    report.pinned = pinnedModels(settings as Record<string, unknown> | null);

    const { data: all } = await svc.from("ai_models").select("*").limit(10000);
    const rows = (all ?? []) as StoredModel[];

    for (const provider of Object.keys(addedBy) as Provider[]) {
      const ids = rows.filter((r) => r.provider === provider && addedBy[provider]!.includes(r.model_id) && !r.nudged_new_at).map((r) => r.model_id).sort();
      if (ids.length === 0) continue;
      const res = await interrupt(db, ownerId, { kind: "ai_models", title: newModelsTitle(provider, ids), url: "/other/settings?tab=ai" }, now);
      report.nudges.push({ about: "new", provider, models: ids, sent: res.sent, reason: res.sent ? undefined : res.reason });
      if (res.sent) await svc.from("ai_models").update({ nudged_new_at: now.toISOString() }).eq("provider", provider).in("model_id", ids);
    }

    const retiredPinned = rows.filter((r) => r.retired_at && !r.nudged_retired_at && report.pinned.includes(r.model_id));
    if (retiredPinned.length > 0) {
      const ids = retiredPinned.map((r) => r.model_id).sort();
      const res = await interrupt(db, ownerId, { kind: "ai_models", title: retiredPinnedTitle(ids), url: "/other/settings?tab=ai" }, now);
      report.nudges.push({ about: "retired_pinned", models: ids, sent: res.sent, reason: res.sent ? undefined : res.reason });
      if (res.sent) {
        for (const r of retiredPinned) await svc.from("ai_models").update({ nudged_retired_at: now.toISOString() }).eq("provider", r.provider).eq("model_id", r.model_id);
      }
    }
  });

  return report;
}
