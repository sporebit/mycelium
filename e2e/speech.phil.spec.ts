/**
 * The PC's voice, end to end without the PC (master run §9, §11): a line is
 * asked for; with the PC off the answer is "say it yourself"; with the PC on
 * it is queued once however many times it is asked; a worker collects the
 * job with a signed upload link, puts the WAV there and reports; from then
 * on the line is a file to play. The rendering itself (Kokoro) is checked
 * on the PC by hand; here a worker stands in for it.
 */
import { expect, test } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_CRON_SECRET } from "./support/env.ts";
import { PHIL, personalSpace } from "./support/users.ts";

const RUN = `e2e-speech-${Date.now().toString(36)}`;
const WORKER = `e2e-voice-${RUN}`;
const bearer = { authorization: `Bearer ${E2E_CRON_SECRET}` };
const LINE = `Two minutes left. Find a stopping place. ${RUN}`;

// A 44-byte WAV header and no samples: a file the bucket accepts.
const TINY_WAV = Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=", "base64");

const pcOff = () => localSql(`update public.workers set last_seen_at = now() - interval '1 hour' where lane = 'pc'`);

test.afterAll(() => {
  localSql(`delete from public.jobs where kind = 'speak' and payload->>'clip_id' in (select id::text from public.speech_clips where text like '%${RUN}%')`);
  // The 44-byte test file stays in the local bucket: the storage schema refuses direct deletes, and the Storage API needs a session this hook has not got.
  localSql(`delete from public.speech_clips where text like '%${RUN}%'`);
  localSql(`delete from public.workers where name = '${WORKER}'`);
});

test("nothing to say is refused; with the PC off the browser speaks", async ({ request }) => {
  expect((await request.post("/api/speech", { data: { text: "   " } })).status()).toBe(400);
  pcOff();
  const res = await request.post("/api/speech", { data: { text: LINE } });
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "off" });
  // nothing was queued and no clip was made for a PC that is not there
  expect(localSql(`select count(*) from public.speech_clips where text like '%${RUN}%'`)[0][0]).toBe("0");
});

test("with the PC on, a line is queued once, rendered by the worker, and a file from then on", async ({ request }) => {
  // The PC is on: the worker checks in.
  const hello = await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["ping"] } });
  expect(hello.ok()).toBeTruthy();

  const first = await request.post("/api/speech", { data: { text: `  ${LINE}  ` } });
  const a = (await first.json()) as { status: string; clip_id: string };
  expect(a.status).toBe("queued");
  expect(a.clip_id).toMatch(/^[0-9a-f-]{36}$/);
  // The same words again: the same clip, still one job.
  const again = (await (await request.post("/api/speech", { data: { text: LINE } })).json()) as { status: string; clip_id: string };
  expect(again).toEqual({ status: "queued", clip_id: a.clip_id });
  expect(localSql(`select count(*) from public.jobs where kind = 'speak' and payload->>'clip_id' = '${a.clip_id}' and status in ('queued', 'claimed')`)[0][0]).toBe("1");
  // The clip is Phil's alone.
  expect(localSql(`select space_id, voice, text from public.speech_clips where id = '${a.clip_id}'`)[0]).toEqual([personalSpace(PHIL), "bf_emma", LINE]);

  // The worker collects it: the words, the voice, and a signed link to put the file.
  const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["speak"], limit: 10 } });
  const { jobs } = (await claim.json()) as { jobs: Array<{ id: string; kind: string; payload: Record<string, unknown> }> };
  const job = jobs.find((j) => j.payload.text === LINE);
  expect(job, "the speak job with its prepared payload").toBeTruthy();
  expect(job!.payload.voice).toBe("bf_emma");
  expect(job!.payload.path).toBe(`${a.clip_id}/clip.wav`);
  expect(String(job!.payload.upload_url)).toContain(`/object/upload/sign/speech/${a.clip_id}/clip.wav`);

  // …renders the WAV (stood in for here) and PUTs it where it was told.
  const put = await request.put(String(job!.payload.upload_url), { headers: { "content-type": "audio/wav", "x-upsert": "true" }, data: TINY_WAV });
  expect(put.status(), await put.text()).toBe(200);
  const done = await request.post("/api/worker/finish", { headers: bearer, data: { id: job!.id, worker: WORKER, ok: true, result: { seconds: 2.24, bytes: TINY_WAV.length } } });
  expect((await done.json()).status).toBe("done");
  expect(localSql(`select path, seconds, (ready_at is not null)::text from public.speech_clips where id = '${a.clip_id}'`)[0]).toEqual([`${a.clip_id}/clip.wav`, "2.24", "true"]);

  // From now on the line is a file, PC on or off.
  pcOff();
  const ready = (await (await request.post("/api/speech", { data: { text: LINE } })).json()) as { status: string; url: string; seconds: number; clip_id: string };
  expect(ready.status).toBe("ready");
  expect(ready.clip_id).toBe(a.clip_id);
  expect(ready.seconds).toBe(2.24);
  const file = await request.get(ready.url);
  expect(file.ok()).toBeTruthy();
  expect((await file.body()).length).toBe(TINY_WAV.length);
  expect(localSql(`select (last_played_at is not null)::text from public.speech_clips where id = '${a.clip_id}'`)[0][0]).toBe("true");
});

test("a job that gives up leaves no half-made clip, so the line is asked for afresh", async ({ request }) => {
  await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["ping"] } });
  const line = `A line the PC could not say. ${RUN}`;
  const a = (await (await request.post("/api/speech", { data: { text: line } })).json()) as { status: string; clip_id: string };
  expect(a.status).toBe("queued");
  localSql(`update public.jobs set max_attempts = 1 where kind = 'speak' and payload->>'clip_id' = '${a.clip_id}'`);
  const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["speak"], limit: 10 } });
  const { jobs } = (await claim.json()) as { jobs: Array<{ id: string; payload: Record<string, unknown> }> };
  const job = jobs.find((j) => j.payload.text === line);
  expect(job).toBeTruthy();
  await request.post("/api/worker/finish", { headers: bearer, data: { id: job!.id, worker: WORKER, ok: false, error: "espeak missing" } });
  expect(localSql(`select count(*) from public.speech_clips where id = '${a.clip_id}'`)[0][0]).toBe("0");
  const b = (await (await request.post("/api/speech", { data: { text: line } })).json()) as { status: string; clip_id: string };
  expect(b.status).toBe("queued");
  expect(b.clip_id).not.toBe(a.clip_id);
});
