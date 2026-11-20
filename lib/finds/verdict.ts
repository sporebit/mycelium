/**
 * The verdict on a find (master run §12): what it is, what it costs, its
 * licence, cautions, Use now / Maybe later / Skip, and which of Phil's
 * projects it suits. The PC's own model writes it (a "finds_verdict" job on
 * the pc lane, free, when the PC is next on); the page is opened in the
 * cloud as the worker claims the job (prepare), so the model reads the
 * thing itself and not a watcher's snippet. When the PC has been off for a
 * day and a half, or gave up on a find, the daily tick asks the cloud
 * model through the meter instead, a few a day, inside the monthly cap.
 * Nothing is installed by either route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudAllowed } from "@/lib/ai/budget";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { MODEL_FAST } from "@/lib/config/models";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { enqueueJob, pcIsOn } from "@/lib/jobs/queue";
import { watcherFetch } from "./fixtures";
import { openFind } from "./open";
import { getFind, mergeRaw, saveVerdict, unverdicted } from "./store";
import type { FindRow, Verdict, VerdictCall } from "./types";
import { RECORDED_HEADER } from "@/lib/ai/meterRules";

export const VERDICT_KIND = "finds_verdict";
/** Hours a find waits for the PC before the cloud is asked. */
export const CLOUD_AFTER_HOURS = 36;
export const CLOUD_PER_RUN = 6;

export const PROJECTS = ["Mycelium", "AI website agency", "Home 3D survey", "StreetGuesser / games", "Trip Book / how-to guides", "none"] as const;

export const VERDICT_SYSTEM = [
  "You review a tool, library, repo, skill, post or security advisory for one developer and say whether it is worth their time. Be specific and plain; British English.",
  "Their projects: Mycelium (a personal Next.js 15 + Supabase + Vercel app with a Telegram bot, a PC worker running local models, and a daily-routine UI); an AI website agency (small business sites built with agents); Home 3D survey (a house scanned to a 3D model); StreetGuesser and other small games; Trip Book and how-to guides (documents and short films).",
  "Rules:",
  "- Say what the thing actually does from the text given, not from its name. If the text is thin, say so in `what` and lower your confidence by choosing maybe_later.",
  "- `cost`: free, free tier with a paid plan (name the price if given), or paid (price). `licence`: the licence named, or 'not stated'.",
  "- `cautions`: anything that runs code or hooks on install, needs an account or key, is young or unmaintained, or is a security advisory affecting an installed package (then say the fixed version if given).",
  "- `verdict`: use_now only if it is free, fits a named project and could be tried in an hour; maybe_later if useful but not now; skip if it does not fit or costs money for little.",
  "- `suits`: the projects it fits, from the list given, or ['none'].",
  "- `summary`: one sentence, under 30 words, that would make sense on its own in a weekly list.",
  "- Never tell the person to install anything. Never say must, should or need to.",
  'Answer with JSON only: {"what":"…","cost":"…","licence":"…","cautions":"…","verdict":"use_now|maybe_later|skip","suits":["…"],"summary":"…"}',
].join("\n");

/** The user half of the prompt. Pure. */
export function verdictPrompt(find: Pick<FindRow, "url" | "title" | "kind" | "source" | "raw">, text: string | null): string {
  const raw = find.raw ?? {};
  const facts: string[] = [];
  for (const k of ["stars", "language", "licence", "topics", "points", "comments", "severity", "packages", "published", "created_at", "pushed_at"]) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    facts.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`.slice(0, 300));
  }
  const snippet = typeof raw.snippet === "string" ? raw.snippet : null;
  return [
    `url: ${find.url}`,
    `title: ${find.title}`,
    `kind: ${find.kind}; seen by: ${find.source}`,
    facts.length ? `facts: ${facts.join("; ")}` : null,
    snippet ? `snippet: ${snippet.slice(0, 600)}` : null,
    `projects: ${PROJECTS.join(" | ")}`,
    text ? `--- page text ---\n${text.slice(0, 9_000)}` : "--- the page could not be opened; judge from the facts above and say so ---",
  ]
    .filter(Boolean)
    .join("\n");
}

const CALLS = new Set<string>(["use_now", "maybe_later", "skip"]);

/** Read the model's answer. Pure, strict: a bad shape is null, never repaired into a verdict. */
export function parseVerdict(text: string): Verdict | null {
  let parsed: unknown;
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    parsed = JSON.parse(body);
  } catch {
    const m = /\{[\s\S]*\}/.exec(body);
    if (!m) return null;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const str = (k: string, max: number, fallback = "not stated") => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).replace(/\s+/g, " ").trim().slice(0, max) : fallback);
  const call = typeof o.verdict === "string" ? o.verdict.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (!CALLS.has(call)) return null;
  const summary = str("summary", 240, "");
  const what = str("what", 600, "");
  if (!summary || !what) return null;
  const suits = Array.isArray(o.suits) ? [...new Set(o.suits.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 5) : [];
  return {
    what,
    cost: str("cost", 160),
    licence: str("licence", 120),
    cautions: str("cautions", 500, "none noted"),
    verdict: call as VerdictCall,
    suits: suits.length ? suits : ["none"],
    summary,
  };
}

/** Queue one PC-lane verdict job per find. A find already queued is left alone. Returns how many were queued. */
export async function queueVerdicts(db: SupabaseClient, finds: readonly Pick<FindRow, "id">[]): Promise<number> {
  let queued = 0;
  for (const f of finds) {
    const res = await enqueueJob(db, { kind: VERDICT_KIND, lane: "pc", dedupeKey: `${VERDICT_KIND}:${f.id}`, maxAttempts: 2, payload: { find_id: f.id, json: true, max_tokens: 700 } });
    if (!res.duplicate) queued += 1;
  }
  return queued;
}

/** Open the page (once; the text is kept on the find) and build the prompt. Shared by the PC and cloud routes. */
async function preparePrompt(db: SupabaseClient, find: FindRow): Promise<{ system: string; user: string }> {
  let text = typeof find.raw?.text === "string" ? (find.raw.text as string) : null;
  if (text === null && !find.raw?.opened_via) {
    const opened = await openFind(watcherFetch(), find.url);
    await mergeRaw(db, find.id, opened.text !== null ? { text: opened.text, opened_via: opened.via } : { opened_via: opened.via, open_reason: opened.reason });
    text = opened.text;
  }
  return { system: VERDICT_SYSTEM, user: verdictPrompt(find, text) };
}

registerJobHandler(VERDICT_KIND, {
  prepare: async (job, db) => {
    const id = typeof job.payload.find_id === "string" ? job.payload.find_id : "";
    const find = id ? await getFind(db, id) : null;
    if (!find) throw new Error("the find is gone");
    if (find.verdict) return { system: VERDICT_SYSTEM, user: "already answered; reply {}" };
    return preparePrompt(db, find);
  },
  apply: async (job, result, db) => {
    const id = typeof job.payload.find_id === "string" ? job.payload.find_id : "";
    if (!id) return;
    const verdict = parseVerdict(typeof result.text === "string" ? result.text : "");
    if (!verdict) {
      // A bad answer is left for the cloud route rather than written down as a guess.
      await mergeRaw(db, id, { pc_failed: "the model's answer was not a verdict" });
      return;
    }
    await saveVerdict(db, id, verdict, "pc");
  },
  onGiveUp: async (job, error, db) => {
    const id = typeof job.payload.find_id === "string" ? job.payload.find_id : "";
    if (id) await mergeRaw(db, id, { pc_failed: error.slice(0, 300) });
  },
});

/** One cloud verdict through the meter. Returns null when the key, the cap or the answer says no. */
export async function cloudVerdict(db: SupabaseClient, find: FindRow, fetchImpl: typeof fetch = fetch): Promise<Verdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const prompt = await preparePrompt(db, find);
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json", [RECORDED_HEADER]: "1" },
    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 700, system: prompt.system, messages: [{ role: "user", content: prompt.user }] }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const msg = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const input = msg.usage?.input_tokens ?? 0;
  const output = msg.usage?.output_tokens ?? 0;
  await recordUsage(db, { tag: "finds.verdict", model: MODEL_FAST, input_tokens: input, output_tokens: output, cost_pence: costPence(MODEL_FAST, input, output), meta: { find_id: find.id } });
  return parseVerdict(msg.content?.find((b) => b.type === "text")?.text ?? "");
}

/**
 * The cloud fallback, run from the daily tick: finds still without a
 * verdict after CLOUD_AFTER_HOURS while the PC is off, or that the PC gave
 * up on, a few at a time, when the month's cap allows. Returns how many
 * were written.
 */
export async function cloudVerdicts(db: SupabaseClient, now: Date = new Date(), opts: { max?: number; fetchImpl?: typeof fetch } = {}): Promise<number> {
  const waiting = await unverdicted(db, 40);
  if (!waiting.length) return 0;
  const cutoff = now.getTime() - CLOUD_AFTER_HOURS * 3_600_000;
  const pcOn = await pcIsOn(db);
  const due = waiting.filter((f) => (f.raw?.pc_failed ? true : !pcOn && Date.parse(f.found_at) < cutoff)).slice(0, opts.max ?? CLOUD_PER_RUN);
  if (!due.length) return 0;
  if (!(await cloudAllowed(db))) return 0;
  let written = 0;
  for (const f of due) {
    try {
      const v = await cloudVerdict(db, f, opts.fetchImpl);
      if (v && (await saveVerdict(db, f.id, v, "cloud", now))) written += 1;
    } catch (err) {
      console.error(`[finds] cloud verdict ${f.id}:`, err);
    }
  }
  return written;
}
