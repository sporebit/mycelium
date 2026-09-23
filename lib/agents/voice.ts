/**
 * The Boys — voices and manner (MYC-148, MYC-149).
 *
 * Each agent has a voice (a provider + voice id) and a speaking style, kept
 * per user in `user_settings.agent_voices` (0136) so a second user can hear
 * the same agent differently. Text-to-speech goes to ElevenLabs when
 * ELEVENLABS_API_KEY is set (Flash v2.5 streams audio in ~75 ms and can
 * clone a consented voice), else to OpenAI's stock voices. Either way the
 * caller streams the audio through; nothing is buffered server-side.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";

export type VoiceProvider = "elevenlabs" | "openai";
export type AgentVoice = { provider: VoiceProvider; voice_id: string; voice_name: string | null; speaking_style: string | null };
export type VoiceOption = { provider: VoiceProvider; voice_id: string; name: string; description: string | null; cloned: boolean; preview_url: string | null };

/** OpenAI stock voices — the fallback when ElevenLabs is not configured. */
const OPENAI_DEFAULT: Record<string, string> = { da_boi: "onyx", fitness: "echo", finance: "fable", tasks: "alloy", nutrition: "nova", founder: "onyx", engineer: "echo" };
export const OPENAI_VOICES: VoiceOption[] = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"].map((v) => ({ provider: "openai", voice_id: v, name: v[0].toUpperCase() + v.slice(1), description: "OpenAI stock voice", cloned: false, preview_url: null }));

export const elevenLabsConfigured = (): boolean => !!process.env.ELEVENLABS_API_KEY;

/** The seven agents, for listing every voice at once. */
export const AGENT_IDS = ["da_boi", "fitness", "finance", "tasks", "nutrition", "founder", "engineer"] as const;

/** The stock voice an agent falls back to when nothing is stored or ElevenLabs is off. */
export function defaultVoice(agentId: string, speakingStyle: string | null = null): AgentVoice {
  return { provider: "openai", voice_id: OPENAI_DEFAULT[agentId] ?? "alloy", voice_name: null, speaking_style: speakingStyle };
}

function normalise(raw: unknown): AgentVoice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider === "elevenlabs" || o.provider === "openai" ? o.provider : null;
  const voice_id = typeof o.voice_id === "string" && o.voice_id.trim() ? o.voice_id.trim() : null;
  if (!provider || !voice_id) return null;
  return {
    provider,
    voice_id,
    voice_name: typeof o.voice_name === "string" && o.voice_name.trim() ? o.voice_name.trim() : null,
    speaking_style: typeof o.speaking_style === "string" && o.speaking_style.trim() ? o.speaking_style.trim().slice(0, 1200) : null,
  };
}

/** Every agent's stored voice for the caller (agent id → voice). */
export async function readAgentVoices(db: SupabaseClient): Promise<Record<string, AgentVoice>> {
  const { data } = await db.from("user_settings").select("agent_voices").limit(1).maybeSingle();
  const raw = ((data as { agent_voices?: unknown } | null)?.agent_voices ?? {}) as Record<string, unknown>;
  const out: Record<string, AgentVoice> = {};
  for (const [id, v] of Object.entries(raw)) {
    const n = normalise(v);
    if (n) out[id] = n;
  }
  return out;
}

/** The stored voice if it can be spoken right now, else the agent's stock default (keeping the manner). */
function resolve(stored: AgentVoice | undefined, agentId: string): AgentVoice {
  if (stored && (stored.provider === "openai" || elevenLabsConfigured())) return stored;
  return defaultVoice(agentId, stored?.speaking_style ?? null);
}

/** The voice to speak with: the stored one, else the provider's default for the agent. */
export async function agentVoice(db: SupabaseClient, agentId: string): Promise<AgentVoice> {
  return resolve((await readAgentVoices(db))[agentId], agentId);
}

/** Every agent's effective voice in one read. */
export async function allAgentVoices(db: SupabaseClient): Promise<Record<string, AgentVoice>> {
  const stored = await readAgentVoices(db);
  const out: Record<string, AgentVoice> = {};
  for (const id of AGENT_IDS) out[id] = resolve(stored[id], id);
  return out;
}

export async function writeAgentVoice(db: SupabaseClient, agentId: string, patch: Partial<AgentVoice>): Promise<AgentVoice | null> {
  const all = await readAgentVoices(db);
  const current = all[agentId] ?? defaultVoice(agentId);
  const next = normalise({ ...current, ...patch });
  if (!next) return null;
  const { data: row } = await db.from("user_settings").select("agent_voices").limit(1).maybeSingle();
  const raw = ((row as { agent_voices?: unknown } | null)?.agent_voices ?? {}) as Record<string, unknown>;
  const { error } = await updateUserSettings(db, { agent_voices: { ...raw, [agentId]: next } });
  if (error) throw new Error(error.message);
  return next;
}

// ---------------------------------------------------------------------------
// speech
// ---------------------------------------------------------------------------

const EL = "https://api.elevenlabs.io/v1";
const elHeaders = (): Record<string, string> => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" });

/**
 * Synthesise one sentence and hand back the provider's streaming body as-is
 * (audio/mpeg). ElevenLabs Flash starts returning bytes in ~75 ms; OpenAI in
 * about a second. Throws on a provider error so the route can 502.
 */
export async function synthesize(text: string, voice: AgentVoice): Promise<ReadableStream<Uint8Array>> {
  if (voice.provider === "elevenlabs" && elevenLabsConfigured()) {
    const res = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voice.voice_id)}/stream?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { ...elHeaders(), "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
    });
    if (!res.ok || !res.body) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.body;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice: voice.provider === "openai" ? voice.voice_id : "alloy", input: text, response_format: "mp3" }),
  });
  if (!res.ok || !res.body) throw new Error(`openai tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.body;
}

/** Voices the caller can pick from: ElevenLabs (own clones first) when configured, then OpenAI's stock set. */
export async function listVoices(): Promise<VoiceOption[]> {
  const out: VoiceOption[] = [];
  if (elevenLabsConfigured()) {
    try {
      const res = await fetch(`${EL}/voices`, { headers: elHeaders() });
      if (res.ok) {
        const j = (await res.json()) as { voices?: Array<{ voice_id: string; name: string; category?: string; description?: string | null; preview_url?: string | null; labels?: Record<string, string> }> };
        for (const v of j.voices ?? []) {
          const cloned = v.category === "cloned" || v.category === "generated" || v.category === "professional";
          const labels = v.labels ? Object.values(v.labels).filter(Boolean).join(", ") : "";
          out.push({ provider: "elevenlabs", voice_id: v.voice_id, name: v.name, description: v.description || labels || v.category || null, cloned, preview_url: v.preview_url ?? null });
        }
        out.sort((a, b) => Number(b.cloned) - Number(a.cloned) || a.name.localeCompare(b.name));
      }
    } catch (err) {
      console.error("[agents/voice] list failed:", err instanceof Error ? err.message : err);
    }
  }
  return [...out, ...OPENAI_VOICES];
}

/**
 * Instant voice clone from a recording of a voice the caller has the right
 * to clone — their own. A minute of clean speech is enough for ElevenLabs'
 * instant clone; the name is what the picker shows.
 */
export async function cloneVoice(name: string, files: Array<{ blob: Blob; filename: string }>, description?: string): Promise<{ voice_id: string; name: string }> {
  if (!elevenLabsConfigured()) throw new Error("ELEVENLABS_API_KEY missing");
  const form = new FormData();
  form.append("name", name);
  if (description) form.append("description", description);
  form.append("remove_background_noise", "true");
  for (const f of files) form.append("files", f.blob, f.filename);
  const res = await fetch(`${EL}/voices/add`, { method: "POST", headers: elHeaders(), body: form });
  if (!res.ok) throw new Error(`elevenlabs clone ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { voice_id: string };
  return { voice_id: j.voice_id, name };
}

export async function deleteClonedVoice(voiceId: string): Promise<boolean> {
  if (!elevenLabsConfigured()) return false;
  const res = await fetch(`${EL}/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: elHeaders() });
  return res.ok;
}

// ---------------------------------------------------------------------------
// sentences (pure — tested)
// ---------------------------------------------------------------------------

const BOUNDARY = /([.!?…]+["'”’)\]]*)\s+/;

/**
 * Split streamed text into sentences ready to speak: the complete ones, and
 * the remainder to carry into the next call. A boundary is sentence
 * punctuation followed by whitespace, so "3.5" and a trailing "Done." are
 * held until more text (or `final`) arrives. Sentences shorter than `min`
 * are merged into the next so the voice never stutters on "Right." alone.
 */
export function takeSentences(buffer: string, opts: { min?: number; final?: boolean } = {}): { sentences: string[]; rest: string } {
  const min = opts.min ?? 12;
  // Each complete sentence with the buffer offset just past its trailing
  // whitespace, so whatever is not emitted can be handed back verbatim —
  // including that whitespace, which the next delta relies on.
  const parts: Array<{ text: string; end: number }> = [];
  const re = new RegExp(BOUNDARY.source, "g");
  let start = 0;
  for (let m = re.exec(buffer); m; m = re.exec(buffer)) {
    parts.push({ text: buffer.slice(start, m.index + m[1].length).trim(), end: re.lastIndex });
    start = re.lastIndex;
  }
  if (opts.final && buffer.slice(start).trim()) parts.push({ text: buffer.slice(start).trim(), end: buffer.length });

  const sentences: string[] = [];
  let carry: string | null = null;
  let carryStart = 0;
  let consumed = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const joined: string = carry ? `${carry} ${p.text}` : p.text;
    if (joined.length < min && !(opts.final && i === parts.length - 1)) {
      if (carry === null) carryStart = consumed;
      carry = joined;
      continue;
    }
    sentences.push(joined);
    carry = null;
    consumed = p.end;
  }

  let rest: string;
  if (carry !== null) {
    if (opts.final) {
      sentences.push(carry);
      rest = "";
    } else {
      rest = buffer.slice(carryStart).trimStart();
    }
  } else {
    rest = opts.final ? "" : buffer.slice(consumed).trimStart();
  }
  return { sentences: sentences.filter(Boolean), rest };
}

/** Strip markdown a voice cannot say: bullets, emphasis, headings, links. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/\*([^*]+)\*|_([^_]+)_/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
