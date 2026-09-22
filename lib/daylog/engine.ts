/**
 * Day log engine (spec §4). One engine, two transports: the Telegram
 * webhook and the app page both call `runTurn`. Part A scope: the loop
 * (prompt → Talk / Quick / Skip / Snooze → turns → score line → close),
 * the append-only transcript, the Sonnet conversation with the rules block
 * (lib/daylog/rules.md, read at runtime), the Sonnet close narrative, the
 * score line in every mode, api_usage tagging. Part B: the per-turn Haiku
 * delta runs before each reply so the probe is grounded in facts-so-far
 * (lib/daylog/extract.ts), Quick mode extracts once, and the close turns the
 * extraction into scenes and review items (lib/daylog/materialise.ts).
 * Part D: seeds on the row and in the prompt (lib/daylog/seeds.ts), the
 * open-thread carry-over (decision 24), photos attached to scenes at close
 * (lib/daylog/media.ts), the day embedded into the memory index and the
 * monthly alert checked (lib/daylog/afterClose.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT } from "@/lib/config/models";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { daylogDay, DATE_RE } from "./day";
import { parseScoreLine, scoreLinePrompt } from "./scores";
import { getDaylogSettings, type DaylogSettings } from "./settings";
import { extractTranscript, extractTurn, groundingBlock } from "./extract";
import { collapseScenes, mergePatch, normaliseExtraction, quickExtraction, type Extraction } from "./extraction";
import { materialise, pendingCount } from "./materialise";
import { gatherSeeds, seedsBlock, type Seeds } from "./seeds";
import { attachPhotosToScenes } from "./media";
import { embedDay, monthlyAlert } from "./afterClose";

export type TranscriptEntry = { role: "user" | "assistant" | "system"; at: string; text: string; channel: "telegram" | "app" | "capture" | "legacy" | "system"; media_id?: string | null };

export type DayRow = {
  id: string;
  day: string;
  status: "pending" | "prompted" | "open" | "closing" | "closed" | "skipped";
  mode: "talk" | "quick" | "skip" | "legacy" | null;
  persona_agent_id: string | null;
  transcript: TranscriptEntry[];
  summary: string | null;
  summary_edited_by_user: boolean;
  extraction: Record<string, unknown>;
  scores: Record<string, number>;
  open_thread: string | null;
  open_thread_asked_at: string | null;
  seeds: Seeds | null;
  turn_count: number;
  cost_pence: number;
  prompted_at: string | null;
  snoozed_until: string | null;
  last_activity_at: string | null;
  closed_at: string | null;
  legacy_journal_id: string | null;
  created_at: string;
  updated_at: string;
  space_id?: string;
  created_by?: string | null;
};

export const DAY_SELECT =
  "id, day, status, mode, persona_agent_id, transcript, summary, summary_edited_by_user, extraction, scores, open_thread, open_thread_asked_at, seeds, turn_count, cost_pence, prompted_at, snoozed_until, last_activity_at, closed_at, legacy_journal_id, created_at, updated_at";

export type TurnResult = {
  reply: string;
  day: DayRow;
  /** what the transport should do next: nothing special, ask for the missing scores, or the day just closed */
  state: "open" | "scores" | "closed";
  missing?: string[];
  /** review items waiting for this day, set when it closes */
  pending?: number;
};

const DONE_RE = /^\s*(done|stop|that's it|thats it|that is it|finished|end|no more)\b[.!]*\s*$/i;

let rulesCache: string | null = null;
export function rulesBlock(): string {
  if (rulesCache) return rulesCache;
  try {
    rulesCache = readFileSync(path.join(process.cwd(), "lib", "daylog", "rules.md"), "utf8");
  } catch {
    rulesCache = "Ask one question per turn. Never assert facts about the world. Close with the score line.";
  }
  return rulesCache;
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

export async function getDay(db: SupabaseClient, day: string): Promise<DayRow | null> {
  const { data } = await db.from("daylog_days").select(DAY_SELECT).eq("day", day).maybeSingle();
  return (data as DayRow | null) ?? null;
}

export async function getDayById(db: SupabaseClient, id: string): Promise<DayRow | null> {
  const { data } = await db.from("daylog_days").select(DAY_SELECT).eq("id", id).maybeSingle();
  return (data as DayRow | null) ?? null;
}

/** Get-or-create the row for a date (status pending). */
export async function ensureDay(db: SupabaseClient, day: string): Promise<DayRow> {
  if (!DATE_RE.test(day)) throw new Error("bad date");
  const existing = await getDay(db, day);
  if (existing) return existing;
  const { data, error } = await db.from("daylog_days").insert({ day }).select(DAY_SELECT).single();
  if (error) {
    // raced by another transport: read it back
    const again = await getDay(db, day);
    if (again) return again;
    throw new Error(`daylog_days insert failed: ${error.message}`);
  }
  return data as DayRow;
}

async function patchDay(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<DayRow> {
  const { data, error } = await db
    .from("daylog_days")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(DAY_SELECT)
    .single();
  if (error || !data) throw new Error(`daylog_days update failed: ${error?.message ?? "no row"}`);
  return data as DayRow;
}

/** Append-only: the transcript is only ever extended. */
async function append(db: SupabaseClient, d: DayRow, entries: TranscriptEntry[], extra: Record<string, unknown> = {}): Promise<DayRow> {
  const now = new Date().toISOString();
  return patchDay(db, d.id, { transcript: [...(d.transcript ?? []), ...entries], last_activity_at: now, ...extra });
}

// ---------------------------------------------------------------------------
// the model
// ---------------------------------------------------------------------------

type PersonaRow = { id: string; display_name: string; tagline: string };

async function personaLine(db: SupabaseClient, agentId: string | null): Promise<string> {
  if (!agentId) return "You are Mycelium's interviewer: plain, warm, brief.";
  const { data } = await db.from("agents").select("id, display_name, tagline").eq("id", agentId).maybeSingle();
  const a = data as PersonaRow | null;
  if (!a) return "You are Mycelium's interviewer: plain, warm, brief.";
  if (a.id === "da_boi") return `You are ${a.display_name} — ${a.tagline}. Dry, direct, friendly; a mate asking about the day, not a form.`;
  return `You are ${a.display_name} — ${a.tagline}.`;
}

function systemPrompt(persona: string, s: DaylogSettings, seeds: Seeds | null): string {
  const seedText = seedsBlock(seeds);
  return [
    persona,
    "",
    rulesBlock(),
    "",
    `Slot list per scene (ask in this order, skipping what is already known): ${s.slots.join(" · ")}.`,
    `Minimum probes for a thin day: ${s.min_probes}. Score keys, in order: ${s.scores.join(", ")}.`,
    seedText ? `\n${seedText}` : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

async function sonnet(
  db: SupabaseClient,
  dayId: string,
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  opts: { maxTokens: number; tag: string },
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL_CHAT,
        max_tokens: opts.maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
    if (!res.ok) throw new Error(j.error?.message ?? `anthropic ${res.status}`);
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    const input = j.usage?.input_tokens ?? 0;
    const output = j.usage?.output_tokens ?? 0;
    await recordUsage(db, { tag: `daylog:${dayId}`, model: MODEL_CHAT, input_tokens: input, output_tokens: output, cost_pence: costPence(MODEL_CHAT, input, output), meta: { kind: opts.tag } });
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function toMessages(t: TranscriptEntry[]): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const e of t) {
    if (e.role === "system") continue;
    const role = e.role;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${e.text}`;
    else out.push({ role, content: e.text });
  }
  // the API wants the first message from the user
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

// ---------------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------------

export const OPENER = "Go on then — where did the day take you?";
/** The opener when a previous night left a loose end (decision 24): asked here, once, with no model turn. */
export function openerWithThread(thread: string): string {
  const t = thread.trim().replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
  return `Last time you mentioned ${/[.!?]$/.test(t) ? t : `${t}.`} How did that go? Then tell me about today.`;
}
export const QUICK_PROMPT = "Quick one: who / where / one line about the day.";

/** Talk: open the day; the opener is fixed (no model call). */
export async function startTalk(db: SupabaseClient, day: string, channel: TranscriptEntry["channel"]): Promise<TurnResult> {
  const s = await getDaylogSettings(db);
  let d = await ensureDay(db, day);
  if (d.status === "closed" || d.status === "skipped") return { reply: `That day is ${d.status}.`, day: d, state: "closed" };
  if (d.status === "open") return { reply: "Carry on — I'm listening.", day: d, state: "open" };
  // started from the page rather than the prompt: the seeds have not been gathered yet
  const seeds = d.seeds ?? (await gatherSeeds(db, day, s));
  // decision 24: at most one carry-over, asked once — it rides on the opener, so the model never has to remember
  const thread = await takeOpenThread(db, d);
  const opener = thread ? openerWithThread(thread) : OPENER;
  d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: opener, channel }], { status: "open", mode: "talk", persona_agent_id: s.persona_agent_id, seeds });
  return { reply: opener, day: d, state: "open" };
}

/** Quick: one template reply, then the score line. */
export async function startQuick(db: SupabaseClient, day: string, channel: TranscriptEntry["channel"]): Promise<TurnResult> {
  let d = await ensureDay(db, day);
  if (d.status === "closed" || d.status === "skipped") return { reply: `That day is ${d.status}.`, day: d, state: "closed" };
  d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: QUICK_PROMPT, channel }], { status: "open", mode: "quick" });
  return { reply: QUICK_PROMPT, day: d, state: "open" };
}

/** Skip: straight to the score line; zero model calls. */
export async function startSkip(db: SupabaseClient, day: string, channel: TranscriptEntry["channel"]): Promise<TurnResult> {
  const s = await getDaylogSettings(db);
  let d = await ensureDay(db, day);
  if (d.status === "closed" || d.status === "skipped") return { reply: `That day is ${d.status}.`, day: d, state: "closed" };
  const line = scoreLinePrompt(s.scores);
  d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: line, channel }], { status: "closing", mode: "skip" });
  return { reply: line, day: d, state: "scores", missing: s.scores.filter((k) => !(k in (d.scores ?? {}))) };
}

export async function snooze(db: SupabaseClient, day: string): Promise<DayRow> {
  const s = await getDaylogSettings(db);
  const d = await ensureDay(db, day);
  const until = new Date(Date.now() + s.snooze_minutes * 60_000).toISOString();
  return patchDay(db, d.id, { status: "pending", snoozed_until: until });
}

/**
 * One turn: append the user's message, then either (a) parse scores if we are
 * closing, (b) close if they said done / the cap is hit, or (c) ask the
 * model for the next question. Never rewrites history.
 */
export async function runTurn(db: SupabaseClient, dayId: string, text: string, channel: TranscriptEntry["channel"], mediaId?: string | null): Promise<TurnResult> {
  const s = await getDaylogSettings(db);
  let d = await getDayById(db, dayId);
  if (!d) throw new Error("day not found");
  if (d.status === "closed" || d.status === "skipped") return { reply: `That day is already ${d.status} — open it on the day page to add to it.`, day: d, state: "closed" };
  const now = new Date().toISOString();
  const userEntry: TranscriptEntry = { role: "user", at: now, text, channel, media_id: mediaId ?? null };

  // (a) the score line
  if (d.status === "closing") {
    const parsed = parseScoreLine(text, s.scores, d.scores ?? {});
    d = await append(db, d, [userEntry], { scores: parsed.scores });
    if (parsed.missing.length) {
      const ask = parsed.any ? `And ${parsed.missing.join(" / ")}, 1–5?` : `Just the numbers: ${scoreLinePrompt(s.scores)}`;
      d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: ask, channel }]);
      return { reply: ask, day: d, state: "scores", missing: parsed.missing };
    }
    return finalise(db, d);
  }

  // a prompted day answered without a button = Talk
  if (d.status === "pending" || d.status === "prompted") {
    d = await patchDay(db, d.id, { status: "open", mode: d.mode ?? "talk", persona_agent_id: d.persona_agent_id ?? s.persona_agent_id });
  }

  // Quick mode: the one line is the day; go to scores
  if (d.mode === "quick") {
    // the template parse stands on its own; the one Haiku call only adds to it
    const base = mergePatch(normaliseExtraction(d.extraction), quickExtraction(text));
    const grounded = await extractTurn(db, d.id, base, QUICK_PROMPT, text);
    d = await append(db, d, [userEntry], { summary: d.summary_edited_by_user ? d.summary : text.trim(), extraction: collapseScenes(grounded.extraction, "day") });
    return toScores(db, d, s, channel);
  }

  const lastAssistant = [...(d.transcript ?? [])].reverse().find((e) => e.role === "assistant")?.text ?? null;
  d = await append(db, d, [userEntry], { turn_count: (d.turn_count ?? 0) + 1 });

  // per-turn delta extraction, before the reply, so the probe is grounded (decision 16)
  const grounded = await extractTurn(db, d.id, normaliseExtraction(d.extraction), lastAssistant, text, { skipModel: DONE_RE.test(text) });
  d = await patchDay(db, d.id, { extraction: grounded.extraction });

  // (b) done, or the cap
  const wantsClose = DONE_RE.test(text) || d.turn_count >= s.turn_cap;
  const system = systemPrompt(await personaLine(db, d.persona_agent_id ?? s.persona_agent_id), s, d.seeds ?? null);
  const messages = toMessages(d.transcript);
  // dynamic and uncached: it rides on the last user message, never in the transcript
  if (messages.length) messages[messages.length - 1].content += `\n\n${groundingBlock(grounded)}`;
  if (wantsClose) {
    messages.push({ role: "user", content: "[system: close now — one line recapping the scenes, then the score line, nothing else]" });
  } else if (d.turn_count >= s.turn_cap - 1) {
    messages.push({ role: "user", content: "[system: this is the last question you may ask — after their reply you will close]" });
  }

  // (c) the model
  let reply: string;
  try {
    reply = await sonnet(db, d.id, system, messages, { maxTokens: 160, tag: wantsClose ? "close" : "turn" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    console.error("[daylog] turn failed:", msg);
    if (wantsClose) return toScores(db, d, s, channel);
    reply = "Lost my thread for a second — say that again, or 'done' to wrap up.";
    d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: reply, channel: "system" }]);
    return { reply, day: d, state: "open" };
  }
  const closing = wantsClose || /score line:/i.test(reply);
  const clean = reply.replace(/score line:\s*/i, "").trim();
  d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: clean || scoreLinePrompt(s.scores), channel }], closing ? { status: "closing" } : {});
  if (closing) {
    // make sure the score line is actually there, whatever the model did
    const hasLine = new RegExp(s.scores[0] ?? "mood", "i").test(clean) && /1\s*[–-]\s*5/.test(clean);
    if (!hasLine) return toScores(db, d, s, channel, clean);
    return { reply: clean, day: d, state: "scores", missing: s.scores.filter((k) => !(k in (d.scores ?? {}))) };
  }
  return { reply: clean, day: d, state: "open" };
}

async function toScores(db: SupabaseClient, d: DayRow, s: DaylogSettings, channel: TranscriptEntry["channel"], prefix?: string): Promise<TurnResult> {
  const line = `${prefix ? `${prefix}\n` : ""}${scoreLinePrompt(s.scores)}`;
  const next = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: line, channel }], { status: "closing" });
  return { reply: line, day: next, state: "scores", missing: s.scores.filter((k) => !(k in (next.scores ?? {}))) };
}

/** Scores are in: narrative (Talk only), then closed / skipped. */
async function finalise(db: SupabaseClient, d: DayRow): Promise<TurnResult> {
  const closedAt = new Date().toISOString();
  if (d.mode === "skip") {
    const next = await patchDay(db, d.id, { status: "skipped", closed_at: closedAt });
    return { reply: "Logged.", day: next, state: "closed" };
  }
  let summary = d.summary;
  if (d.mode === "talk" && !d.summary_edited_by_user) {
    const userText = d.transcript.filter((e) => e.role === "user").map((e) => e.text).join("\n");
    if (userText.trim().length > 20) {
      try {
        summary = await sonnet(
          db,
          d.id,
          "You write the narrative entry for someone's day from the interview transcript. British English. Only what they said — no adjectives they didn't use, no facts they didn't state, no advice. First person is fine if they used it. 60–160 words, one paragraph, then a blank line and one line per scene in order, each starting with '• '. No title.",
          [...toMessages(d.transcript), { role: "user", content: "[system: write the entry now]" }],
          { maxTokens: 500, tag: "narrative" },
        );
      } catch (err) {
        console.error("[daylog] narrative failed:", err instanceof Error ? err.message : err);
        summary = d.summary ?? null;
      }
    }
  }
  // scenes + review items (spec §4.4 steps 2–3); a failure here never blocks the close
  let extraction: Extraction = normaliseExtraction(d.extraction);
  let pending = 0;
  try {
    const m = await materialise(db, { id: d.id, day: d.day, summary: summary ?? d.summary }, extraction);
    extraction = m.extraction;
    pending = (await pendingCount(db, d.id)) + m.quotes;
  } catch (err) {
    console.error("[daylog] materialise failed:", err instanceof Error ? err.message : err);
  }
  try {
    await attachPhotosToScenes(db, d.id, d.transcript);
  } catch (err) {
    console.error("[daylog] photo attach failed:", err instanceof Error ? err.message : err);
  }
  const cost = await dayCostPence(db, d.id);
  const next = await patchDay(db, d.id, { status: "closed", closed_at: closedAt, summary: summary ?? d.summary, cost_pence: cost, extraction, open_thread: d.open_thread ?? extraction.open_thread });
  // steps 5–6: the memory index and the monthly line, neither on the reply's critical path
  void embedDay(db, next);
  void monthlyAlert(db).catch((err) => console.error("[daylog] monthly alert failed:", err instanceof Error ? err.message : err));
  const recap = summary ? summary.split("\n")[0] : "Closed.";
  return { reply: pending ? `${recap}\n${pending} item${pending === 1 ? "" : "s"} to review.` : recap, day: next, state: "closed", pending };
}

/**
 * Re-run extraction on the frozen transcript (spec §5). Starts from the
 * current state, so refs stay stable; materialise only adds scenes and review
 * items that are new — existing rows, edited or not, are never rewritten.
 */
export async function reextract(db: SupabaseClient, dayId: string): Promise<{ day: DayRow; scenes: number; queued: number; quotes: number }> {
  const d = await getDayById(db, dayId);
  if (!d) throw new Error("day not found");
  if (d.status !== "closed") throw new Error("only a closed day can be re-extracted");
  const current = normaliseExtraction(d.extraction);
  const seed: Extraction = d.mode === "quick" ? mergePatch(current, quickExtraction(d.transcript.find((e) => e.role === "user")?.text ?? "")) : current;
  const read = (await extractTranscript(db, d.id, d.transcript, seed)) ?? seed;
  const fresh = d.mode === "quick" ? collapseScenes(read, "day") : read;
  const m = await materialise(db, { id: d.id, day: d.day, summary: d.summary }, { ...fresh, scene_ids: current.scene_ids });
  const cost = await dayCostPence(db, d.id);
  const { data: v } = await db.from("daylog_days").select("extraction_version").eq("id", d.id).maybeSingle();
  const version = Number((v as { extraction_version?: number } | null)?.extraction_version ?? 1) + 1;
  const next = await patchDay(db, d.id, { extraction: m.extraction, extraction_version: version, cost_pence: cost });
  return { day: next, scenes: m.scenes, queued: m.queued, quotes: m.quotes };
}

/**
 * The most recent earlier day with an unasked open thread: mark it asked
 * (never asked again, decision 24) and return the thread for tonight's opener.
 */
async function takeOpenThread(db: SupabaseClient, d: DayRow): Promise<string | null> {
  const { data } = await db
    .from("daylog_days")
    .select("id, open_thread")
    .lt("day", d.day)
    .not("open_thread", "is", null)
    .is("open_thread_asked_at", null)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev = data as { id: string; open_thread: string } | null;
  if (!prev?.open_thread) return null;
  await db.from("daylog_days").update({ open_thread_asked_at: new Date().toISOString() }).eq("id", prev.id);
  return prev.open_thread;
}

export async function dayCostPence(db: SupabaseClient, dayId: string): Promise<number> {
  const { data } = await db.from("api_usage").select("cost_pence").eq("tag", `daylog:${dayId}`).limit(500);
  return Math.round(((data ?? []) as Array<{ cost_pence: number }>).reduce((s, r) => s + Number(r.cost_pence || 0), 0) * 100) / 100;
}

/** Force close from the app / cron: an open day goes to the score line; a closing day closes with what it has. */
export async function forceClose(db: SupabaseClient, dayId: string, channel: TranscriptEntry["channel"]): Promise<TurnResult> {
  const s = await getDaylogSettings(db);
  const d = await getDayById(db, dayId);
  if (!d) throw new Error("day not found");
  if (d.status === "closed" || d.status === "skipped") return { reply: `Already ${d.status}.`, day: d, state: "closed" };
  if (d.status === "closing" || d.status === "pending" || d.status === "prompted") {
    const asSkip = d.mode === null || d.mode === "skip" || d.transcript.every((e) => e.role !== "user");
    return finalise(db, asSkip ? await patchDay(db, d.id, { mode: "skip" }) : d);
  }
  return toScores(db, d, s, channel);
}

/** Today's (or the given) day for a transport that only knows "now". */
export function currentDay(now = new Date(), cutoff = "03:00"): string {
  return daylogDay(now, cutoff);
}

/** A capture routed as `journal` outside the interview: appended, never lost. */
export async function appendCapture(db: SupabaseClient, text: string, opts: { day?: string; audioUrl?: string | null } = {}): Promise<DayRow> {
  const d = await ensureDay(db, opts.day ?? currentDay());
  return append(db, d, [{ role: "user", at: new Date().toISOString(), text, channel: "capture", media_id: opts.audioUrl ?? null }]);
}
