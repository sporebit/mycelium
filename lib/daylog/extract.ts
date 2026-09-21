/**
 * Day log extraction — the model half (spec §4.3, decisions 16, 21, 22).
 * Haiku, tool-use with a strict schema, one delta per exchange. Every call
 * is soft: a failure leaves the working state as it was and the interview
 * carries on ungrounded for that turn. Nothing here writes to People.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_FAST } from "@/lib/config/models";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { resolveSpeaker } from "@/lib/quotes/server";
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL, factsSoFar, mergePatch, namesIn, withoutKnown, type Extraction, type ExtractionPatch } from "./extraction";

type PersonRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null; relationship: string | null; notes: string | null };

/** name (lower-cased) → person id, for names that match exactly one person by alias. Never creates anyone. */
export async function knownPeople(db: SupabaseClient, names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const n of names.slice(0, 20)) {
    try {
      const r = await resolveSpeaker(db, n);
      if (r.person_id) out.set(n.toLowerCase(), r.person_id);
    } catch {
      /* unresolved is fine */
    }
  }
  return out;
}

/** One-line person cards for anyone mentioned (decision 22): name, who they are, last seen — nothing more. */
export async function personCards(db: SupabaseClient, known: Map<string, string>): Promise<string[]> {
  const ids = Array.from(new Set(known.values()));
  if (!ids.length) return [];
  const [{ data }, { data: seen }] = await Promise.all([
    db.from("people").select("id, display_name, first_name, last_name, relationship, notes").in("id", ids),
    db.from("people_daylog_stats").select("person_id, last_seen").in("person_id", ids),
  ]);
  const lastSeen = new Map(((seen ?? []) as Array<{ person_id: string; last_seen: string }>).map((r) => [r.person_id, r.last_seen]));
  return ((data ?? []) as PersonRow[]).map((p) => {
    const name = p.display_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || "someone");
    // no relationship set: the first line of their notes is where a "who's X?" answer was kept
    const who = p.relationship ?? (p.notes ? p.notes.split("\n")[0].trim().slice(0, 80) || null : null);
    return [name, who, lastSeen.get(p.id) ? `last seen ${lastSeen.get(p.id)}` : null].filter(Boolean).join(" — ");
  });
}

async function haikuPatch(db: SupabaseClient, dayId: string, user: string, tag: string, maxTokens = 900): Promise<ExtractionPatch | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL_FAST,
        max_tokens: maxTokens,
        system: [{ type: "text", text: EXTRACTION_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
        messages: [{ role: "user", content: user }],
      }),
    });
    const j = (await res.json()) as { content?: Array<{ type: string; input?: unknown }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
    if (!res.ok) throw new Error(j.error?.message ?? `anthropic ${res.status}`);
    const input = j.usage?.input_tokens ?? 0;
    const output = j.usage?.output_tokens ?? 0;
    await recordUsage(db, { tag: `daylog:${dayId}`, model: MODEL_FAST, input_tokens: input, output_tokens: output, cost_pence: costPence(MODEL_FAST, input, output), meta: { kind: tag } });
    const block = (j.content ?? []).find((c) => c.type === "tool_use");
    return block?.input && typeof block.input === "object" ? (block.input as ExtractionPatch) : null;
  } finally {
    clearTimeout(timer);
  }
}

export type Grounding = { extraction: Extraction; known: Map<string, string>; cards: string[] };

/**
 * After each of the person's messages, before the interviewer's reply: fold
 * the latest exchange into the working extraction and resolve who is known.
 */
export async function extractTurn(db: SupabaseClient, dayId: string, ex: Extraction, lastAssistant: string | null, userText: string, opts: { skipModel?: boolean } = {}): Promise<Grounding> {
  let next = ex;
  // a bare "done" has nothing new to read: ground on what we already have
  if (!opts.skipModel) next = await patched(db, dayId, ex, lastAssistant, userText);
  const known = await knownPeople(db, [...namesIn(next), ...next.unknown_names]);
  next = withoutKnown(next, known.keys());
  return { extraction: next, known, cards: await personCards(db, known) };
}

/** One Haiku delta folded in; on any failure the state comes back unchanged. */
async function patched(db: SupabaseClient, dayId: string, ex: Extraction, lastAssistant: string | null, userText: string): Promise<Extraction> {
  try {
    const knownBefore = await knownPeople(db, namesIn(ex));
    const cardsBefore = await personCards(db, knownBefore);
    const prompt = [
      `Extraction so far:\n${factsSoFar(ex)}`,
      ex.scenes.length ? `Existing scene refs: ${ex.scenes.map((s) => s.ref).join(", ")}` : null,
      `Known people: ${cardsBefore.length ? cardsBefore.join("; ") : "none matched yet"}`,
      Object.keys(ex.name_answers).length ? `Names already explained: ${Object.keys(ex.name_answers).join(", ")}` : null,
      `Latest exchange:\n${lastAssistant ? `Interviewer: ${lastAssistant}\n` : ""}Narrator: ${userText}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const patch = await haikuPatch(db, dayId, prompt, "extract");
    return patch ? mergePatch(ex, patch) : ex;
  } catch (err) {
    console.error("[daylog] extraction failed:", err instanceof Error ? err.message : err);
    return ex;
  }
}

/** Re-extraction (spec §5): the whole frozen transcript in one call, from an empty state. */
export async function extractTranscript(db: SupabaseClient, dayId: string, transcript: Array<{ role: string; text: string }>, seed: Extraction): Promise<Extraction | null> {
  const lines = transcript.filter((e) => e.role !== "system").map((e) => `${e.role === "user" ? "Narrator" : "Interviewer"}: ${e.text}`);
  if (!lines.some((l) => l.startsWith("Narrator"))) return null;
  const patch = await haikuPatch(db, dayId, `Extraction so far:\n${factsSoFar(seed)}\n\nKnown people: not supplied\n\nEverything under "Extraction so far" is already recorded: do not restate any of it, even in different words. Read the whole interview below and return only scenes and facts that are missing from it entirely (empty arrays if nothing is):\n${lines.join("\n")}`, "reextract", 2500);
  if (!patch) return null;
  const merged = mergePatch(seed, patch);
  return withoutKnown(merged, (await knownPeople(db, [...namesIn(merged), ...merged.unknown_names])).keys());
}

/** The dynamic, uncached block appended to the interviewer's last user message (spec §4.3). */
export function groundingBlock(g: Grounding): string {
  return [
    "[context for you — none of this was said tonight unless it appears under facts]",
    `facts so far:\n${factsSoFar(g.extraction)}`,
    `person cards (already in their People — never ask who these are, however little the card says): ${g.cards.length ? g.cards.join("; ") : "none"}`,
    g.extraction.unknown_names.length ? `names not yet explained (ask who they are, once): ${g.extraction.unknown_names.join(", ")}` : "names not yet explained: none",
  ].join("\n");
}
