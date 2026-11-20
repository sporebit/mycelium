import { describe, expect, it } from "vitest";
import {
  fetchAnthropicModels,
  fetchOpenAiModels,
  newModelsTitle,
  pinnedModels,
  reconcile,
  retiredPinnedTitle,
  type SeenModel,
  type StoredModel,
} from "./aiModels";

const NOW = new Date("2026-11-20T05:00:00Z");
const EARLIER = "2026-11-01T05:00:00.000Z";

const seen = (id: string, provider: "anthropic" | "openai" = "anthropic"): SeenModel => ({ provider, model_id: id, display_name: null, released_at: null, raw: { id } });
const stored = (id: string, extra: Partial<StoredModel> = {}): StoredModel => ({
  ...seen(id),
  first_seen: EARLIER,
  last_seen: EARLIER,
  retired_at: null,
  nudged_new_at: null,
  nudged_retired_at: null,
  ...extra,
});

describe("reconciling a provider's list with what is stored", () => {
  it("a model never seen before is added with first-seen and last-seen now", () => {
    const r = reconcile([], [seen("claude-x")], NOW);
    expect(r.added).toEqual(["claude-x"]);
    expect(r.retired).toEqual([]);
    expect(r.rows[0]).toMatchObject({ model_id: "claude-x", first_seen: NOW.toISOString(), last_seen: NOW.toISOString(), retired_at: null });
  });

  it("a model seen again keeps its first-seen and moves its last-seen to now", () => {
    const r = reconcile([stored("claude-x")], [seen("claude-x")], NOW);
    expect(r.added).toEqual([]);
    expect(r.rows[0]).toMatchObject({ first_seen: EARLIER, last_seen: NOW.toISOString(), retired_at: null });
  });

  it("a stored model the fetch no longer lists is retired now, and keeps its last-seen", () => {
    const r = reconcile([stored("claude-old"), stored("claude-x")], [seen("claude-x")], NOW);
    expect(r.retired).toEqual(["claude-old"]);
    const old = r.rows.find((x) => x.model_id === "claude-old")!;
    expect(old.retired_at).toBe(NOW.toISOString());
    expect(old.last_seen).toBe(EARLIER);
  });

  it("a model already retired is left alone, and is not retired twice", () => {
    const r = reconcile([stored("claude-old", { retired_at: EARLIER, nudged_retired_at: EARLIER })], [], NOW);
    expect(r.retired).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it("a retired model the provider lists again is back, and a later retirement is news again", () => {
    const r = reconcile([stored("claude-back", { retired_at: EARLIER, nudged_retired_at: EARLIER })], [seen("claude-back")], NOW);
    expect(r.returned).toEqual(["claude-back"]);
    expect(r.rows[0]).toMatchObject({ retired_at: null, nudged_retired_at: null, last_seen: NOW.toISOString() });
  });

  it("the same id listed twice counts once", () => {
    const r = reconcile([], [seen("a"), seen("a")], NOW);
    expect(r.rows).toHaveLength(1);
  });
});

describe("what is pinned", () => {
  it("is the environment's roles, the capture classifier and the two Settings choices, once each", () => {
    const pins = pinnedModels({ anthropic_model: "claude-opus-4-1", ai_spending_categorisation_model: " claude-haiku-4-5 " }, { OPENAI_CLASSIFIER_MODEL: "gpt-4o-mini" } as unknown as NodeJS.ProcessEnv);
    expect(pins).toContain("claude-opus-4-1");
    expect(pins).toContain("claude-haiku-4-5");
    expect(pins).toContain("gpt-4o-mini");
    expect(new Set(pins).size).toBe(pins.length);
  });

  it("ignores empty and missing settings", () => {
    const pins = pinnedModels(null, {} as unknown as NodeJS.ProcessEnv);
    expect(pins.every((p) => p.length > 0)).toBe(true);
    expect(pins.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the nudge wording", () => {
  it("is one line per provider, naming up to four models", () => {
    expect(newModelsTitle("anthropic", ["claude-x"])).toBe("New Anthropic model: claude-x");
    expect(newModelsTitle("openai", ["a", "b", "c", "d", "e", "f"])).toBe("New OpenAI models: a, b, c, d and 2 more");
    expect(retiredPinnedTitle(["claude-old"])).toBe("Retired AI model still pinned: claude-old");
  });
});

describe("reading the providers' lists", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("follows Anthropic's pages and keeps the display name and date", async () => {
    const calls: string[] = [];
    const fake: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (!url.includes("after_id")) return json({ data: [{ id: "claude-a", display_name: "Claude A", created_at: "2026-01-01T00:00:00Z" }], has_more: true, last_id: "claude-a" });
      return json({ data: [{ id: "claude-b", display_name: "Claude B" }], has_more: false });
    };
    const models = await fetchAnthropicModels("k", fake);
    expect(models.map((m) => m.model_id)).toEqual(["claude-a", "claude-b"]);
    expect(models[0]).toMatchObject({ provider: "anthropic", display_name: "Claude A", released_at: "2026-01-01T00:00:00Z" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("after_id=claude-a");
  });

  it("reads OpenAI's list and turns its unix date into a timestamp", async () => {
    const fake: typeof fetch = async () => json({ data: [{ id: "gpt-x", created: 1_700_000_000, owned_by: "openai" }] });
    const models = await fetchOpenAiModels("k", fake);
    expect(models).toEqual([{ provider: "openai", model_id: "gpt-x", display_name: null, released_at: "2023-11-14T22:13:20.000Z", raw: { id: "gpt-x", created: 1_700_000_000, owned_by: "openai" } }]);
  });

  it("a refused call is an error, not an empty list (an empty list would retire everything)", async () => {
    const fake: typeof fetch = async () => json({ error: "nope" }, 401);
    await expect(fetchAnthropicModels("k", fake)).rejects.toThrow("HTTP 401");
    await expect(fetchOpenAiModels("k", fake)).rejects.toThrow("HTTP 401");
  });
});
