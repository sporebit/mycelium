/**
 * The capture pipeline (master run §5): a capture is stored the moment it
 * arrives and everything slow happens afterwards.
 *
 *   receiveCapture()   one insert. The caller answers "saved" as soon as it
 *                      returns. Sending the same client id again returns
 *                      the same capture, so a retry can never duplicate.
 *   processCapture()   paragraphs, splitting a long dump into items,
 *                      classification, filing, and the "Filed as …" reply.
 *                      Safe to run twice, safe to run late: a capture that
 *                      was received but never processed (the function was
 *                      cut off, the model was down) is picked up again by
 *                      the sweep, so nothing is lost by a failure here.
 *
 * Routing, as Phil decided (2026-11-20): every capture goes to review. A
 * single capture is filed at once with the classifier's guess, so the thing
 * exists and can be found, and its card waits in the evening close to be
 * accepted or fixed. Items split out of a long dump are NOT filed: they are
 * held as ideas with the guess attached, and become what the guess says
 * only when their card is accepted (research rule 19: a brain dump must not
 * turn into commitments by itself). A card left seven days files itself;
 * see lib/capture/autofile.ts.
 *
 * `db` acts as the person capturing (a request client, or one from
 * withUser() for the sweep and for worker results).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudAllowed } from "@/lib/ai/budget";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { MODEL_FAST } from "@/lib/config/models";
import { routeRawVoice } from "@/lib/fitness/voice-route";
import { parseWeight } from "@/lib/health/parse-weight";
import { interrupt } from "@/lib/nudges/interrupt";
import { classifyCapture, type Classification } from "@/lib/router/classifyCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { writeCapture } from "@/lib/router/writeCapture";
import { localDateKey } from "@/lib/util/date";
import { fieldsFromClassification, recordCaptureLearning } from "./learning";
import { createRoutedRow } from "./materialise";
import { formatParagraphs } from "./paragraphs";
import { type AskModel, splitCapture } from "./split";

export type CaptureStatus = "received" | "processing" | "processed" | "failed";
export type CaptureSource = "web" | "api" | "telegram";

export type ReceiveInput = {
  /** What was said or typed. May be empty when only audio has arrived so far. */
  text?: string | null;
  /** The sender's own id for this capture: the same id always means the same capture. */
  clientUuid?: string | null;
  source: CaptureSource;
  /** "typed" for a keyboard, "dictation" for speech turned into text on the device. */
  textSource?: "typed" | "dictation";
  /** The person changed the dictated text by hand before sending: it is theirs, and a later re-transcription must not replace it. */
  edited?: boolean;
  /** Skip the classifier's choice of kind (the old audio endpoint's `kind` field). */
  forcedKind?: string | null;
};

export type Received = { id: string; duplicate: boolean; status: CaptureStatus };

const UUIDISH = /^[A-Za-z0-9._:-]{8,80}$/;

/** A capture has to look like something on every list before it is classified. */
export function placeholderClassification(text: string | null | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const words = (text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return {
    kind: "capture",
    title: words.slice(0, 7).join(" ") || "Voice capture",
    summary: "",
    urgency: "someday",
    key: false,
    tags: [],
    confidence: "low",
    pending: true,
    ...extra,
  };
}

/**
 * Store the capture. One insert, no model, no other table: this is the
 * whole of what stands between the person and "Saved".
 */
export async function receiveCapture(db: SupabaseClient, input: ReceiveInput): Promise<Received> {
  const original = (input.text ?? "").trim();
  const clientUuid = input.clientUuid && UUIDISH.test(input.clientUuid) ? input.clientUuid : null;
  const row: Record<string, unknown> = {
    source: input.source,
    raw_text: original ? formatParagraphs(original) : null,
    dictation_text: original || null,
    text_source: original ? (input.textSource ?? "typed") : null,
    text_edited: input.edited === true,
    status: "received",
    classification: placeholderClassification(original, input.forcedKind ? { forced_kind: input.forcedKind } : {}),
  };
  if (clientUuid) row.client_uuid = clientUuid;

  const { data, error } = await db.from("raw_captures").insert(row).select("id, status").single();
  if (!error && data) return { id: data.id as string, duplicate: false, status: data.status as CaptureStatus };

  // 23505: this client id is already stored. That is the retry working, not a failure.
  if (error?.code === "23505" && clientUuid) {
    // Oldest first, one row: the id is unique per space (0162), and the caller may see more than one space.
    const { data: found } = await db.from("raw_captures").select("id, status, raw_text").eq("client_uuid", clientUuid).order("created_at", { ascending: true }).limit(1);
    const existing = (found ?? [])[0] as { id: string; status: string; raw_text: string | null } | undefined;
    if (existing) {
      // The audio arrived first and the words second: give the stored capture its text.
      if (!existing.raw_text && original) {
        await db
          .from("raw_captures")
          .update({
            raw_text: formatParagraphs(original),
            dictation_text: original,
            text_source: input.textSource ?? "typed",
            text_edited: input.edited === true,
            classification: placeholderClassification(original),
          })
          .eq("id", existing.id);
      }
      return { id: existing.id as string, duplicate: true, status: existing.status as CaptureStatus };
    }
  }
  throw new Error(`capture not stored: ${error?.message ?? "no row"}`);
}

const KIND_LABEL: Record<string, string> = {
  task: "a task",
  ticket: "a ticket",
  reminder: "a reminder",
  purchase: "something to buy",
  media: "something to watch, read or hear",
  account: "an account",
  quote: "a quote",
  journal: "a Day log entry",
  pain_log: "a pain log",
  workout: "a workout",
  decision: "a decision",
  idea: "an idea",
  note: "a note",
  capture: "a note",
  person: "a note about a person",
};

/** "Filed as a task" — the words of the reply after "Saved". */
export function filedAs(kind: string): string {
  return `Filed as ${KIND_LABEL[kind] ?? "a note"}`;
}

/** One cheap cloud call that returns text, recorded against the monthly cap. Null when no model answered. */
function cloudAsk(db: SupabaseClient, tag: string): AskModel {
  return async (system, user) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: 200, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const input = json.usage?.input_tokens ?? 0;
    const output = json.usage?.output_tokens ?? 0;
    await recordUsage(db, { tag, model: MODEL_FAST, input_tokens: input, output_tokens: output, cost_pence: costPence(MODEL_FAST, input, output) });
    return json.content?.find((c) => c.type === "text")?.text ?? null;
  };
}

type CaptureRow = {
  id: string;
  source: CaptureSource;
  raw_text: string | null;
  audio_url: string | null;
  status: CaptureStatus;
  classification: Record<string, unknown> | null;
  parent_capture_id: string | null;
  process_attempts: number;
  routed_to: string | null;
};

const ROW = "id, source, raw_text, audio_url, status, classification, parent_capture_id, process_attempts, routed_to";

export type ProcessResult =
  | { state: "done"; kind: string; title: string; routed_to: string; children?: number }
  | { state: "waiting_for_text" }
  | { state: "already_done" }
  | { state: "busy" }
  | { state: "failed"; error: string };

export type ProcessOptions = {
  /** Send the "Filed as …" reply (a push with a fix link). Off for the web form, where the person is looking at the result. */
  reply?: boolean;
  /** Tests inject a model; production uses the cloud under the cap, or none. */
  ask?: AskModel | null;
  /** false = never call a cloud model for this run. */
  cloud?: boolean;
};

async function finish(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("raw_captures")
    .update({ status: "processed", processed_at: new Date().toISOString(), process_error: null, ...patch })
    .eq("id", id);
  if (error) throw new Error(`capture ${id} not finished: ${error.message}`);
}

/** Classify, file (or hold), and mark processed. Idempotent. */
export async function processCapture(db: SupabaseClient, uid: string, captureId: string, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const { data: found } = await db.from("raw_captures").select(ROW).eq("id", captureId).maybeSingle();
  const row = found as CaptureRow | null;
  if (!row) return { state: "failed", error: "capture not found" };
  if (row.status === "processed") return { state: "already_done" };
  if (!row.raw_text?.trim()) return { state: "waiting_for_text" };

  // Claim it: only one run processes a capture, however many are started.
  const { data: claimed } = await db
    .from("raw_captures")
    .update({ status: "processing", process_attempts: row.process_attempts + 1 })
    .eq("id", row.id)
    .in("status", ["received", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { state: "busy" };

  const text = row.raw_text.trim();
  const forcedKind = typeof row.classification?.forced_kind === "string" ? (row.classification.forced_kind as string) : null;
  const isChild = row.parent_capture_id !== null;

  try {
    const useCloud = opts.cloud !== false && (await cloudAllowed(db));

    // 1. A weight said aloud is a fact to log, not a filing decision.
    const weight = !forcedKind && !isChild ? parseWeight(text) : null;
    if (weight) {
      const { data: metric } = await db
        .from("body_metrics")
        .upsert({ date: localDateKey(), weight: weight.value_kg, weight_unit: "kg" }, { onConflict: "space_id,date" })
        .select("id")
        .maybeSingle();
      const shown = weight.original_unit === "kg" ? `${weight.original_value} kg` : `${weight.original_value} ${weight.original_unit} (${weight.value_kg} kg)`;
      const title = `Weight logged — ${shown}`;
      await finish(db, row.id, {
        classification: { kind: "note", title, summary: "", urgency: "someday", key: false, tags: ["weight"], confidence: "high", logged: { weight_kg: weight.value_kg } },
        llm_source: "regex",
        routed_to: metric?.id ? "body_metrics" : "raw_captures",
        routed_id: metric?.id ?? row.id,
      });
      if (opts.reply) await reply(db, uid, row.id, title, null);
      return { state: "done", kind: "note", title, routed_to: "body_metrics" };
    }

    // 2. A long dump becomes separate items, each its own card.
    if (!isChild && !forcedKind) {
      const ask = opts.ask === undefined ? (useCloud ? cloudAsk(db, "capture.split") : undefined) : (opts.ask ?? undefined);
      const { segments, by } = await splitCapture(text, ask);
      if (segments.length > 1) {
        const children = segments.map((s, i) => ({
          source: row.source,
          raw_text: s.text,
          dictation_text: s.text,
          text_source: "dictation",
          status: "received",
          parent_capture_id: row.id,
          segment_index: i,
          audio_url: row.audio_url,
          classification: placeholderClassification(s.text),
        }));
        const { data: made, error } = await db.from("raw_captures").insert(children).select("id");
        if (error || !made) throw new Error(`split not stored: ${error?.message ?? "no rows"}`);
        const title = `${made.length} items from one recording`;
        // The original is the record of what was said; its items are the cards.
        await finish(db, row.id, {
          classification: { kind: "capture", title, summary: "", urgency: "someday", key: false, tags: [], confidence: "high", split: { count: made.length, by } },
          llm_source: by === "model" ? "anthropic" : "regex",
          routed_to: "raw_captures",
          routed_id: row.id,
          reviewed_at: new Date().toISOString(),
        });
        for (const child of made) await processCapture(db, uid, child.id as string, { ...opts, reply: false });
        if (opts.reply) await reply(db, uid, row.id, `Saved as ${made.length} separate items`, "They are in tonight's review, as ideas until you accept them.");
        return { state: "done", kind: "capture", title, routed_to: "raw_captures", children: made.length };
      }
    }

    // 3. One item: what is it?
    const { classification: classified, llm_source } = await classifyCapture(text, { supabase: db, userId: uid, usageTag: "capture.classify", cloud: useCloud });
    const classification = { ...classified, ...(forcedKind ? { kind: forcedKind } : {}) } as Classification;
    const kind = String(classification.kind);

    // 4a. An item out of a dump is held as an idea; the guess rides with it.
    if (isChild) {
      await finish(db, row.id, { classification: { ...classification, held: true }, llm_source, routed_to: "raw_captures", routed_id: row.id });
      await recordCaptureLearning(db, { captureId: row.id, text, source: row.source, predictedKind: kind, predictedFields: fieldsFromClassification(classification as unknown as Record<string, unknown>), predictedLlmSource: llm_source });
      return { state: "done", kind, title: classification.title, routed_to: "raw_captures" };
    }

    // 4b. A workout said aloud goes to the session it belongs to.
    if (kind === "workout") {
      const routed = await routeRawVoice(db, text, uid);
      const summary = routed.kind === "routed" ? routed.result.summary : "Workout: pick the session it belongs to";
      await finish(db, row.id, {
        classification: { ...classification, workout_route: routed.kind === "routed" ? { session_id: routed.result.session_id, sets_logged: routed.result.sets_logged } : { pending_route_id: routed.pending_route_id } },
        llm_source,
        routed_to: "raw_captures",
        routed_id: row.id,
      });
      if (opts.reply) await reply(db, uid, row.id, summary, null);
      return { state: "done", kind, title: classification.title, routed_to: "raw_captures" };
    }

    // 4c. A reminder with a time becomes a reminder; without one it waits for its card.
    if (kind === "reminder") {
      let routedTo = "raw_captures";
      let routedId = row.id;
      try {
        const made = await createRoutedRow(db, uid, row.id, text, row.audio_url, classification as unknown as Record<string, unknown>);
        routedTo = made.routedTo;
        routedId = made.routedId;
      } catch {
        /* no date or time was given: the card asks for one */
      }
      await finish(db, row.id, { classification: { ...classification, resolved_entity_id: null }, llm_source, routed_to: routedTo, routed_id: routedId });
      await recordCaptureLearning(db, { captureId: row.id, text, source: row.source, predictedKind: kind, predictedFields: fieldsFromClassification(classification as unknown as Record<string, unknown>), predictedLlmSource: llm_source });
      if (opts.reply) await reply(db, uid, row.id, filedAs(routedTo === "tickets" ? "reminder" : "note"), classification.title);
      return { state: "done", kind, title: classification.title, routed_to: routedTo };
    }

    // 4d. Everything else is filed the way it always was, into the row that already exists.
    const written = await writeCapture({ supabase: db, userId: uid, source: row.source, rawText: text, audioUrl: row.audio_url, classification, llmSource: llm_source, existingCaptureId: row.id });
    await finish(db, row.id, {});
    if (useCloud) void embedAndStore({ supabase: db, sourceType: written.memorySourceType, sourceId: written.memorySourceId, text });
    if (opts.reply) await reply(db, uid, row.id, kind === "quote" && written.quoteReadBack ? written.quoteReadBack : filedAs(kind), classification.title);
    return { state: "done", kind, title: classification.title, routed_to: written.routedTo };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[capture] processing ${row.id} failed:`, message);
    // The capture itself is safe in its row. It goes back for the sweep to retry.
    await db.from("raw_captures").update({ status: "failed", process_error: message.slice(0, 500) }).eq("id", row.id);
    return { state: "failed", error: message };
  }
}

/** The "Filed as …" push, with a link to fix it. A reply to something the person started: never counted against the day's interruptions. */
async function reply(db: SupabaseClient, uid: string, captureId: string, title: string, body: string | null): Promise<void> {
  try {
    await interrupt(db, uid, { kind: "capture_filed", origin: "reply", title, body: body ?? undefined, url: `/organisation/captures/review?focus=${captureId}`, channels: ["push"] });
  } catch (err) {
    console.error("[capture] reply not sent:", err);
  }
}
