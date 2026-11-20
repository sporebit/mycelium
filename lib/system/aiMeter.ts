/**
 * The meter on every paid AI call (master run §9).
 *
 * Installed once when the server starts (instrumentation.ts), it stands in
 * front of the server's own `fetch`. A call to a paid AI endpoint
 * (lib/ai/meterRules.ts says which) is:
 *
 *   1. refused if this month's cap is spent: the caller gets a 429 shaped
 *      like a provider error and nothing leaves the building;
 *   2. otherwise sent, and what it cost is written to api_usage from the
 *      provider's own reply (or, for a stream, from the events as they go
 *      by; the caller's stream is not delayed or altered);
 *   3. followed by one alert at four-fifths of the cap and one at the cap.
 *
 * Call sites that record their own spend under their own tag mark the
 * request (RECORDED_HEADER); those are gated but not counted twice. Every
 * other site needs no change, including ones written later: the point of a
 * meter at the door is that nobody has to remember it.
 *
 * The cap is for the whole instance (one bill), so the month's spend is
 * read with the service role across every user.
 */
import { cloudCapPence } from "@/lib/ai/budget";
import {
  type CapState,
  capRefusalBody,
  type MeteredCall,
  meteredCall,
  overCap,
  RECORDED_HEADER,
  requestFacts,
  thresholdsReached,
  type Usage,
  usageFromAnthropicStream,
  usageFromJson,
  usageFromSpeech,
} from "@/lib/ai/meterRules";
import { createServiceClient } from "./serviceClient";

export type MeterDeps = {
  /** This month's spend against the cap. May be a little stale; throws if it cannot be known at all. */
  capState: () => Promise<CapState>;
  /** Write one usage row. Must not throw. */
  record: (call: MeteredCall, usage: Usage) => Promise<void>;
  /** Called after a recorded spend, and on a refusal: send any alert that is now due, once. Must not throw. */
  spent: () => Promise<void>;
};

const STREAM_TEXT_LIMIT = 4 * 1024 * 1024;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Read a stream to its end as text, without holding more than a few megabytes. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (text.length < STREAM_TEXT_LIMIT) text += decoder.decode(value, { stream: true });
  }
  return text;
}

/** A fetch that meters paid AI calls and passes everything else straight through. */
export function createMeteredFetch(inner: typeof fetch, deps: MeterDeps): typeof fetch {
  return async function meteredFetch(input, init) {
    const call = meteredCall(urlOf(input));
    if (!call) return inner(input, init);

    let state: CapState;
    try {
      state = await deps.capState();
    } catch (err) {
      // The month's spend cannot be read at all: do not spend blind.
      console.error("[ai-meter] the month's spend could not be read; the paid call was not made:", err instanceof Error ? err.message : err);
      return new Response(capRefusalBody({ spent_pence: 0, cap_pence: 0 }).replace("is spent (£0.00 of £0.00)", "could not be checked"), {
        status: 429,
        headers: { "content-type": "application/json", "x-mycelium-cap": "unknown" },
      });
    }
    if (overCap(state)) {
      void deps.spent();
      return new Response(capRefusalBody(state), { status: 429, headers: { "content-type": "application/json", "x-mycelium-cap": "reached" } });
    }

    // The marker is for this meter only: it does not travel to the provider.
    const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
    const selfRecorded = headers.get(RECORDED_HEADER) === "1";
    if (selfRecorded) headers.delete(RECORDED_HEADER);
    const facts = requestFacts(init?.body);

    const res = await inner(input, selfRecorded ? { ...init, headers } : init);
    if (!res.ok || selfRecorded) return res;

    const settle = (usage: Usage | null) => {
      if (!usage) return;
      void deps
        .record(call, usage)
        .then(() => deps.spent())
        .catch(() => undefined);
    };

    try {
      if (call.endpoint === "speech") {
        settle(usageFromSpeech(call, facts));
        return res;
      }
      const type = res.headers.get("content-type") ?? "";
      if (call.provider === "anthropic" && res.body && (facts.stream || type.includes("text/event-stream"))) {
        // Two readers of the one stream: the caller's is handed back untouched; the other is read here for the usage events.
        const [forCaller, forMeter] = res.body.tee();
        void drain(forMeter)
          .then((text) => settle(usageFromAnthropicStream(text)))
          .catch(() => undefined);
        return new Response(forCaller, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      if (type.includes("json")) {
        void res
          .clone()
          .json()
          .then((body) => settle(usageFromJson(call, body, facts)))
          .catch(() => undefined);
      }
    } catch (err) {
      // Counting must never break the call it counts.
      console.error("[ai-meter] could not read the usage of a call:", err instanceof Error ? err.message : err);
    }
    return res;
  };
}

// ---------------------------------------------------------------------------
// The real thing

const INSTALLED = Symbol.for("mycelium.aiMeter.installed");
const FRESH_MS = 30_000;
const STALE_OK_MS = 10 * 60_000;

let known: { state: CapState; at: number } | null = null;
let owner: { id: string; space: string } | null = null;

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};
const monthKey = () => new Date().toISOString().slice(0, 7);

async function readCapState(): Promise<CapState> {
  if (known && Date.now() - known.at < FRESH_MS) return known.state;
  try {
    const { data, error } = await createServiceClient().from("api_usage").select("cost_pence").gte("at", monthStart()).limit(20_000);
    if (error) throw new Error(error.message);
    const spent = (data ?? []).reduce((s, r) => s + Number((r as { cost_pence: number }).cost_pence || 0), 0);
    known = { state: { spent_pence: spent, cap_pence: cloudCapPence() }, at: Date.now() };
    return known.state;
  } catch (err) {
    // A blip: carry on from what was known a moment ago rather than stopping everything. Longer than that, stop.
    if (known && Date.now() - known.at < STALE_OK_MS) return known.state;
    throw err;
  }
}

async function ownerOf(): Promise<{ id: string; space: string } | null> {
  if (owner) return owner;
  const { data } = await createServiceClient().from("profiles").select("id, personal_space_id").eq("is_instance_owner", true).limit(1).maybeSingle();
  const row = data as { id: string; personal_space_id: string | null } | null;
  if (row?.personal_space_id) owner = { id: row.id, space: row.personal_space_id };
  return owner;
}

async function writeUsage(call: MeteredCall, usage: Usage): Promise<void> {
  try {
    // One bill, one payer: unattributed spend is filed under the instance owner.
    const who = await ownerOf();
    if (!who) return;
    const { error } = await createServiceClient()
      .from("api_usage")
      .insert({
        tag: `meter.${call.provider}.${call.endpoint}`,
        provider: call.provider,
        model: usage.model,
        input_tokens: Math.round(usage.input_tokens),
        output_tokens: Math.round(usage.output_tokens),
        cost_pence: usage.cost_pence,
        meta: { ...usage.meta, ...(usage.estimated ? { estimated: true } : {}), via: "meter" },
        space_id: who.space,
        created_by: who.id,
      });
    if (error) console.error("[ai-meter] usage row not written:", error.message);
    else if (known) known = { state: { ...known.state, spent_pence: known.state.spent_pence + usage.cost_pence }, at: known.at };
  } catch (err) {
    console.error("[ai-meter] usage row not written:", err instanceof Error ? err.message : err);
  }
}

async function alertIfDue(): Promise<void> {
  try {
    const state = await readCapState();
    const reached = thresholdsReached(state);
    if (!reached.length) return;
    const db = createServiceClient();
    const month = monthKey();
    const pounds = (p: number) => `£${(p / 100).toFixed(2)}`;
    for (const threshold of reached) {
      const { data } = await db.from("audit_log").select("id").eq("action", "ai_cap_alert").eq("metadata->>month", month).eq("metadata->>threshold", String(threshold)).limit(1);
      if (data?.length) continue;
      const who = await ownerOf();
      // Claim it before sending: two requests finishing together must not both send.
      const { error } = await db.from("audit_log").insert({ action: "ai_cap_alert", resource_type: "api_usage", metadata: { month, threshold, spent_pence: state.spent_pence, cap_pence: state.cap_pence }, ...(who ? { space_id: who.space, created_by: who.id } : {}) });
      if (error) continue;
      const { sendToPhil } = await import("@/lib/tickets/notify");
      await sendToPhil(
        threshold >= 100
          ? `Cloud AI: this month's cap is spent (${pounds(state.spent_pence)} of ${pounds(state.cap_pence)}). Paid AI calls are stopped until the 1st. Capture, the PC's own model and everything free carry on.`
          : `Cloud AI: ${pounds(state.spent_pence)} of this month's ${pounds(state.cap_pence)} cap is spent. At ${pounds(state.cap_pence)} paid calls stop until the 1st.`,
      );
    }
  } catch (err) {
    console.error("[ai-meter] alert check failed:", err instanceof Error ? err.message : err);
  }
}

/** Put the meter in front of the server's fetch. Safe to call more than once. */
export function installAiMeter(): void {
  const g = globalThis as typeof globalThis & { [INSTALLED]?: boolean };
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;
  globalThis.fetch = createMeteredFetch(globalThis.fetch.bind(globalThis), { capState: readCapState, record: writeUsage, spent: alertIfDue });
}
