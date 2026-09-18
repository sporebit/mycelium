/**
 * Day log engine (spec §4). One engine, two transports: the Telegram
 * webhook and the app page both call `runTurn`. Part A scope: the loop
 * (prompt → Talk / Quick / Skip / Snooze → turns → score line → close),
 * the append-only transcript, the Sonnet conversation with the rules block
 * (lib/daylog/rules.md, read at runtime), the Sonnet close narrative, the
 * score line in every mode, api_usage tagging. No extraction yet (Part B).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT } from "@/lib/config/models";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { daylogDay, DATE_RE } from "./day";
import { parseScoreLine, scoreLinePrompt } from "./scores";
import { getDaylogSettings, type DaylogSettings } from "./settings";

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
  "id, day, status, mode, persona_agent_id, transcript, summary, summary_edited_by_user, extraction, scores, open_thread, turn_count, cost_pence, prompted_at, snoozed_until, last_activity_at, closed_at, legacy_journal_id, created_at, updated_at";

export type TurnResult = {
  reply: string;
  day: DayRow;
  /** what the transport should do next: nothing special, ask for the missing scores, or the day just closed */
  state: "open" | "scores" | "closed";
  missing?: string[];
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

function systemPrompt(persona: string, s: DaylogSettings): string {
  return [
    persona,
    "",
    rulesBlock(),
    "",
    `Slot list per scene (ask in this order, skipping what is already known): ${s.slots.join(" · ")}.`,
    `Minimum probes for a thin day: ${s.min_probes}. Score keys, in order: ${s.scores.join(", ")}.`,
  ].join("\n");
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
export const QUICK_PROMPT = "Quick one: who / where / one line about the day.";

/** Talk: open the day; the opener is fixed (no model call). */
export async function startTalk(db: SupabaseClient, day: string, channel: TranscriptEntry["channel"]): Promise<TurnResult> {
  const s = await getDaylogSettings(db);
  let d = await ensureDay(db, day);
  if (d.status === "closed" || d.status === "skipped") return { reply: `That day is ${d.status}.`, day: d, state: "closed" };
  if (d.status === "open") return { reply: "Carry on — I'm listening.", day: d, state: "open" };
  d = await append(db, d, [{ role: "assistant", at: new Date().toISOString(), text: OPENER, channel }], { status: "open", mode: "talk", persona_agent_id: s.persona_agent_id });
  return { reply: OPENER, day: d, state: "open" };
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
    d = await append(db, d, [userEntry], { summary: d.summary_edited_by_user ? d.summary : text.trim() });
    return toScores(db, d, s, channel);
  }

  d = await append(db, d, [userEntry], { turn_count: (d.turn_count ?? 0) + 1 });

  // (b) done, or the cap
  const wantsClose = DONE_RE.test(text) || d.turn_count >= s.turn_cap;
  const system = systemPrompt(await personaLine(db, d.persona_agent_id ?? s.persona_agent_id), s);
  const messages = toMessages(d.transcript);
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
  const cost = await dayCostPence(db, d.id);
  const next = await patchDay(db, d.id, { status: "closed", closed_at: closedAt, summary: summary ?? d.summary, cost_pence: cost });
  const recap = summary ? summary.split("\n")[0] : "Closed.";
  return { reply: recap, day: next, state: "closed" };
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
