/**
 * Shared by the capture specs (Phil's and Tess's): the two-step shape of an
 * Auto capture since the pipeline was rebuilt (stored and answered at once,
 * worked out afterwards), reading a capture's row back, playing the PC
 * worker's part for a transcription, and removing what a capture became.
 */
import type { APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { expect, json } from "./daylog.helpers.ts";

export type Row = {
  id: string;
  source: string;
  raw_text: string | null;
  dictation_text: string | null;
  text_source: string | null;
  text_edited: boolean;
  status: "received" | "processing" | "processed" | "failed";
  classification: Record<string, unknown>;
  llm_source: string | null;
  routed_to: string | null;
  routed_id: string | null;
  reviewed_at: string | null;
  discarded_at: string | null;
  deleted_at: string | null;
  auto_filed_at: string | null;
  processed_at: string | null;
  process_error: string | null;
  parent_capture_id: string | null;
  segment_index: number | null;
  audio_path: string | null;
  client_uuid: string | null;
  space_id: string;
  created_by: string;
  created_at: string;
};

/** The capture's row, straight from the table (the API has no single-capture read). */
export function row(id: string): Row | null {
  const r = localSql(`select row_to_json(c) from public.raw_captures c where id = '${id}'`)[0];
  return r ? (JSON.parse(r[0]) as Row) : null;
}

/** The items a long capture was split into, in order. */
export function childrenOf(parentId: string): Row[] {
  return localSql(`select row_to_json(c) from public.raw_captures c where parent_capture_id = '${parentId}' order by segment_index`).map((r) => JSON.parse(r[0]) as Row);
}

/** Wait until the pipeline has finished with a capture, and return its row. */
export async function processed(id: string, timeout = 20_000): Promise<Row> {
  await expect.poll(() => row(id)?.status, { message: `capture ${id} is processed`, timeout }).toBe("processed");
  return row(id)!;
}

export type Saved = { ok: boolean; status: string; capture_id: string; summary: string; deduplicated?: boolean };

/**
 * An Auto capture: stored and answered 202 "saved" at once, with nothing
 * about what it is. "At once" is part of the contract, so it is timed.
 */
export async function autoCapture(api: APIRequestContext, text: string, extra: Record<string, unknown> = {}): Promise<Saved> {
  const started = Date.now();
  const res = await api.post("/api/capture", { data: { text, ...extra } });
  const took = Date.now() - started;
  expect(res.status(), `auto capture → ${(await res.text()).slice(0, 200)}`).toBe(202);
  const body = await json<Saved>(res);
  expect(body).toMatchObject({ ok: true, status: "saved", summary: "Saved" });
  expect(body.capture_id).toMatch(/^[0-9a-f-]{36}$/);
  // what it is and where it went are not in the reply any more
  for (const key of ["kind", "title", "routed_to", "routed_id", "llm_source", "urgency"]) expect(body, `the reply has no ${key}`).not.toHaveProperty(key);
  expect(took, `"Saved" came back in ${took} ms`).toBeLessThan(1_000);
  return body;
}

/** Capture, then wait for the pipeline: the row as it ends up. */
export async function captured(api: APIRequestContext, text: string, extra: Record<string, unknown> = {}): Promise<Row> {
  const saved = await autoCapture(api, text, extra);
  return processed(saved.capture_id);
}

const DELETE_ROUTE: Record<string, (id: string) => string> = {
  tickets: (id) => `/api/tickets/${id}?hard=1`,
  purchases: (id) => `/api/purchases/${id}`,
  media_items: (id) => `/api/media/${id}`,
  quotes: (id) => `/api/quotes/${id}`,
  accounts: (id) => `/api/finance/service-accounts/${id}`,
  exercise_pain_logs: (id) => `/api/fitness/pain-logs/${id}`,
};

/**
 * Remove captures this spec made, their split-out items, and whatever each
 * became (read at tidy-up time, so a row made later by an approve is found).
 * `api` must be the owner. A Day log line, a person's notes and a weight are
 * the caller's to deal with.
 */
export async function tidyCaptures(api: APIRequestContext, ids: string[]): Promise<void> {
  const wanted = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/.test(id)))];
  if (!wanted.length) return;
  const list = wanted.map((id) => `'${id}'`).join(",");
  const rows = localSql(`select id, coalesce(routed_to, ''), coalesce(routed_id::text, '') from public.raw_captures where id in (${list}) or parent_capture_id in (${list})`);
  for (const [, table, routedId] of rows) if (DELETE_ROUTE[table] && routedId) await api.delete(DELETE_ROUTE[table](routedId));
  for (const [id] of rows) await api.delete(`/api/captures/${id}`);
}

/** A ticket's place on the board and what the capture's suggestions set on it. */
export function ticket(id: string): { category: string; kind: string; title: string; tags: string[] | null; tools: string[] | null; points: number | null; where_ctx: string | null; time_window: string | null; suggested: Record<string, unknown> | null; remind_at: string | null; project_id: string | null } | null {
  const r = localSql(
    `select json_build_object('category', s.category, 'kind', t.kind, 'title', t.title, 'tags', t.tags, 'tools', t.tools, 'points', t.points, 'where_ctx', t.where_ctx, 'time_window', t.time_window, 'suggested', t.suggested, 'remind_at', t.remind_at, 'project_id', t.project_id) from public.tickets t left join public.ticket_statuses s on s.id = t.status_id where t.id = '${id}'`,
  )[0];
  return r ? JSON.parse(r[0]) : null;
}

// ---------------------------------------------------------------------------
// audio, and the PC worker's part
// ---------------------------------------------------------------------------

/** A few bytes standing in for a recording. Nothing here decodes it; it only has to be stored and handed back. */
export const VOICE_NOTE = Buffer.from("e2e voice note — not real audio, only bytes to store and fetch back");

export type AudioSaved = { ok: boolean; status: string; capture_id: string; audio: string; summary: string; transcription: string; deduplicated?: boolean };

export async function sendAudio(api: APIRequestContext, fields: Record<string, string> = {}): Promise<AudioSaved> {
  const res = await api.post("/api/capture-audio", { multipart: { audio: { name: "note.m4a", mimeType: "audio/mp4", buffer: VOICE_NOTE }, ...fields } });
  expect(res.status(), `audio capture → ${(await res.text()).slice(0, 200)}`).toBe(202);
  const body = await json<AudioSaved>(res);
  expect(body).toMatchObject({ ok: true, status: "saved", audio: "stored" });
  return body;
}

export type Job = { id: string; kind: string; status: string; lane: string; payload: Record<string, unknown>; attempts: number; claimed_by: string | null; error: string | null };

/** The transcription jobs queued for a capture, oldest first. */
export function jobsFor(captureId: string): Job[] {
  return localSql(`select row_to_json(j) from public.jobs j where kind = 'transcribe' and payload->>'capture_id' = '${captureId}' order by created_at`).map((r) => JSON.parse(r[0]) as Job);
}

/** Jobs a claim handed to this spec's worker and not yet finished, by capture id. */
const inHand = new Map<string, { id: string; worker: string; payload: Record<string, unknown> }>();

/**
 * Be the PC: collect the transcription job for a capture. `cron` carries the
 * CRON_SECRET bearer. A claim hands over every job that is waiting, so the
 * others are kept in hand for the test that asks for them next.
 */
export async function claimTranscription(cron: APIRequestContext, worker: string, captureId: string): Promise<{ id: string; payload: Record<string, unknown> }> {
  if (!inHand.has(captureId)) {
    const res = await cron.post("/api/worker/claim", { data: { worker, kinds: ["transcribe"], limit: 20 } });
    expect(res.status(), await res.text()).toBe(200);
    const { jobs } = await json<{ jobs: Array<{ id: string; kind: string; payload: Record<string, unknown> }> }>(res);
    for (const j of jobs) inHand.set(String(j.payload.capture_id), { id: j.id, worker, payload: j.payload });
  }
  const mine = inHand.get(captureId);
  expect(mine, `a claim returned the job for capture ${captureId}`).toBeTruthy();
  expect(mine!.worker).toBe(worker);
  inHand.delete(captureId);
  return mine!;
}

/** Be the PC: post the transcript for a claimed job. */
export async function finishTranscription(cron: APIRequestContext, worker: string, jobId: string, text: string): Promise<void> {
  const res = await cron.post("/api/worker/finish", { data: { id: jobId, worker, ok: true, result: { text } } });
  expect(res.status(), await res.text()).toBe(200);
  expect(await json(res)).toMatchObject({ ok: true, status: "done" });
}

/** The same words, whitespace aside. */
export const flat = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
