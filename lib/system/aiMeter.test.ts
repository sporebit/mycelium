import { describe, expect, it, vi } from "vitest";
import type { MeteredCall, Usage } from "@/lib/ai/meterRules";
import { FEATURE_HEADER, RECORDED_HEADER } from "@/lib/ai/meterRules";
import { createMeteredFetch, type MeterDeps } from "./aiMeter";

const flush = () => new Promise((r) => setTimeout(r, 20));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function rig(spent = 0, cap = 500) {
  const recorded: Array<{ call: MeteredCall; usage: Usage; feature: string | null }> = [];
  const sent: Array<{ url: string; headers: Headers }> = [];
  const deps: MeterDeps & { spentCalls: number } = {
    spentCalls: 0,
    capState: async () => ({ spent_pence: spent, cap_pence: cap }),
    record: async (call, usage, feature) => void recorded.push({ call, usage, feature }),
    spent: async () => void (deps.spentCalls += 1),
  };
  let reply: () => Response = () => json({ model: "claude-haiku-4-5", usage: { input_tokens: 1000, output_tokens: 100 } });
  const inner = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers) });
    return reply();
  }) as unknown as typeof fetch;
  return { fetch: createMeteredFetch(inner, deps), inner, deps, recorded, sent, replyWith: (f: () => Response) => (reply = f) };
}

const CLAUDE = "https://api.anthropic.com/v1/messages";

describe("the meter at the door", () => {
  it("everything that is not a paid AI call passes straight through, unread and uncounted", async () => {
    const r = rig();
    r.replyWith(() => json({ ok: true }));
    const res = await r.fetch("https://example.supabase.co/rest/v1/tickets", { headers: { apikey: "x" } });
    expect(await res.json()).toEqual({ ok: true });
    await flush();
    expect(r.recorded).toEqual([]);
    expect(r.deps.spentCalls).toBe(0);
  });

  it("a paid call is sent, its reply handed back whole, and its cost recorded once", async () => {
    const r = rig();
    const res = await r.fetch(CLAUDE, { method: "POST", body: JSON.stringify({ model: "claude-haiku-4-5", messages: [] }) });
    expect(((await res.json()) as { usage: { input_tokens: number } }).usage.input_tokens).toBe(1000);
    await flush();
    expect(r.recorded).toHaveLength(1);
    expect(r.recorded[0].call).toEqual({ provider: "anthropic", endpoint: "messages" });
    expect(r.recorded[0].usage).toMatchObject({ input_tokens: 1000, output_tokens: 100 });
    expect(r.recorded[0].usage.cost_pence).toBeGreaterThan(0);
    expect(r.deps.spentCalls).toBe(1);
  });

  it("over the cap the call is not made: a 429 that reads like a provider error", async () => {
    const r = rig(500, 500);
    const res = await r.fetch(CLAUDE, { method: "POST", body: "{}" });
    expect(res.status).toBe(429);
    expect(res.headers.get("x-mycelium-cap")).toBe("reached");
    expect(((await res.json()) as { error: { type: string } }).error.type).toBe("cloud_cap_reached");
    expect(r.inner).not.toHaveBeenCalled();
    await flush();
    expect(r.recorded).toEqual([]);
    expect(r.deps.spentCalls, "the alert is checked on a refusal too").toBe(1);
  });

  it("if the month's spend cannot be read at all, it does not spend blind", async () => {
    const r = rig();
    r.deps.capState = async () => {
      throw new Error("database away");
    };
    const res = await createMeteredFetch(r.inner, r.deps)(CLAUDE, { method: "POST", body: "{}" });
    expect(res.status).toBe(429);
    expect(res.headers.get("x-mycelium-cap")).toBe("unknown");
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("could not be checked");
    expect(r.inner).not.toHaveBeenCalled();
  });

  it("a site that records its own spend is gated but not counted twice, and its marker does not travel", async () => {
    const r = rig();
    await r.fetch(CLAUDE, { method: "POST", headers: { "x-api-key": "k", [RECORDED_HEADER]: "1" }, body: "{}" });
    await flush();
    expect(r.recorded).toEqual([]);
    expect(r.sent[0].headers.get(RECORDED_HEADER)).toBeNull();
    expect(r.sent[0].headers.get("x-api-key")).toBe("k");
    // …and over the cap it is refused like any other.
    const over = rig(600, 500);
    expect((await over.fetch(CLAUDE, { method: "POST", headers: { [RECORDED_HEADER]: "1" }, body: "{}" })).status).toBe(429);
  });

  it("a site that names its feature is counted under that name, and the name does not travel", async () => {
    const r = rig();
    await r.fetch(CLAUDE, { method: "POST", headers: { "x-api-key": "k", [FEATURE_HEADER]: "Agents.Chat" }, body: "{}" });
    await flush();
    expect(r.recorded).toHaveLength(1);
    expect(r.recorded[0].feature).toBe("agents.chat");
    expect(r.sent[0].headers.get(FEATURE_HEADER)).toBeNull();
    expect(r.sent[0].headers.get("x-api-key")).toBe("k");
  });

  it("a site that names nothing is still counted, with no feature", async () => {
    const r = rig();
    await r.fetch(CLAUDE, { method: "POST", body: "{}" });
    await flush();
    expect(r.recorded[0].feature).toBeNull();
  });

  it("a failed call costs nothing and is handed back as it came", async () => {
    const r = rig();
    r.replyWith(() => json({ type: "error", error: { type: "overloaded_error" } }, 529));
    const res = await r.fetch(CLAUDE, { method: "POST", body: "{}" });
    expect(res.status).toBe(529);
    await flush();
    expect(r.recorded).toEqual([]);
  });

  it("a stream reaches the caller untouched while its usage is read from the events going by", async () => {
    const r = rig();
    const events = [
      'data: {"type":"message_start","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":200,"output_tokens":1}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":40}}\n\n',
    ];
    r.replyWith(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              for (const e of events) c.enqueue(new TextEncoder().encode(e));
              c.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    const res = await r.fetch(CLAUDE, { method: "POST", body: JSON.stringify({ model: "claude-sonnet-4-5", stream: true }) });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(events.join(""));
    await flush();
    expect(r.recorded).toHaveLength(1);
    expect(r.recorded[0].usage).toMatchObject({ model: "claude-sonnet-4-5", input_tokens: 200, output_tokens: 40 });
  });

  it("speech is counted by what was sent, since its reply is sound", async () => {
    const r = rig();
    r.replyWith(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const res = await r.fetch("https://api.openai.com/v1/audio/speech", { method: "POST", body: JSON.stringify({ model: "tts-1", input: "Twelve chars" }) });
    expect((await res.arrayBuffer()).byteLength).toBe(3);
    await flush();
    expect(r.recorded[0].usage.meta).toEqual({ chars: 12 });
    expect(r.recorded[0].call).toEqual({ provider: "openai", endpoint: "speech" });
  });

  it("a recording that fails never breaks the call it was counting", async () => {
    const r = rig();
    r.deps.record = async () => {
      throw new Error("usage table away");
    };
    const res = await createMeteredFetch(r.inner, r.deps)(CLAUDE, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await flush();
  });
});
