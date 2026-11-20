/**
 * The PC job queue, end to end (0159; master run §9): a job is queued for
 * Phil, the real worker script collects it over HTTP, and the result comes
 * back. Also: the worker's routes refuse anyone without the worker's key,
 * a second worker cannot finish a job it does not hold, and a job nobody
 * can do is handed back with its error.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace } from "./support/users.ts";

const RUN = `e2e-worker-${Date.now().toString(36)}`;
const WORKER = path.resolve(process.cwd(), "pc-worker/worker.mjs");
const bearer = { authorization: `Bearer ${E2E_CRON_SECRET}` };

function queue(kind: string, extra = ""): string {
  const space = personalSpace(PHIL);
  return localSql(
    `insert into public.jobs (kind, payload, lane, space_id, created_by, dedupe_key ${extra ? ", max_attempts" : ""})
     values ('${kind}', '{"run":"${RUN}"}', 'pc', '${space}', '${PHIL.id}', '${RUN}-${kind}-${Math.random().toString(36).slice(2, 8)}' ${extra})
     returning id`,
  )[0][0];
}
const job = (id: string) => {
  const [status, attempts, error, result] = localSql(`select status, attempts, coalesce(error, ''), coalesce(result::text, '') from public.jobs where id = '${id}'`)[0];
  return { status, attempts: Number(attempts), error, result };
};

function runWorkerOnce(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [WORKER, "--once"],
      { env: { ...process.env, MYCELIUM_WORKER_URL: E2E_ORIGIN, MYCELIUM_WORKER_SECRET: E2E_CRON_SECRET, MYCELIUM_WORKER_NAME: name }, timeout: 60_000 },
      (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(String(stdout))),
    );
  });
}

test.afterAll(() => {
  localSql(`delete from public.jobs where payload->>'run' = '${RUN}'`);
  localSql(`delete from public.workers where name like 'e2e-%'`);
});

test("the worker routes refuse a caller without the worker's key", async ({ request }) => {
  for (const url of ["/api/worker/claim", "/api/worker/finish"]) {
    // Phil's own session is not the worker's key.
    expect((await request.post(url, { data: { worker: "x", kinds: ["ping"] } })).status(), url).toBe(401);
    expect((await request.post(url, { data: { worker: "x", kinds: ["ping"] }, headers: { authorization: "Bearer wrong" } })).status(), url).toBe(401);
  }
});

test("a queued job is collected by the worker script and comes back done", async () => {
  // The queue is shared with every other suite on this stack, and a worker takes four jobs a round. Clear
  // what others left waiting (recordings that are not audio), or this round is spent on those.
  localSql(`delete from public.jobs where status in ('queued', 'claimed') and coalesce(payload->>'run', '') <> '${RUN}'`);
  const id = queue("ping");
  expect(job(id).status).toBe("queued");

  const out = await runWorkerOnce("e2e-desktop");
  expect(out).toContain("ping");

  const after = job(id);
  expect(after.status).toBe("done");
  expect(after.attempts).toBe(1);
  expect(after.result).toContain("pong");

  // The claim was also the heartbeat: the app can tell the PC is on.
  const [lane, age] = localSql(`select lane, extract(epoch from now() - last_seen_at)::int from public.workers where name = 'e2e-desktop'`)[0];
  expect(lane).toBe("pc");
  expect(Number(age)).toBeLessThan(60);
});

test("only the worker holding a job can finish it", async ({ request }) => {
  const id = queue("ping");
  const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: "e2e-first", kinds: ["ping"], limit: 20 } });
  expect(claim.status()).toBe(200);
  const jobs = ((await claim.json()) as { jobs: Array<{ id: string }> }).jobs;
  expect(jobs.map((j) => j.id)).toContain(id);

  const intruder = await request.post("/api/worker/finish", { headers: bearer, data: { id, worker: "e2e-second", ok: true, result: {} } });
  expect(intruder.status()).toBe(409);
  expect(job(id).status).toBe("claimed");

  for (const j of jobs) {
    const done = await request.post("/api/worker/finish", { headers: bearer, data: { id: j.id, worker: "e2e-first", ok: true, result: { pong: true } } });
    expect(done.status()).toBe(200);
  }
  expect(job(id).status).toBe("done");
});

test("a failure goes back to the queue, and stays failed with its error after the last attempt", async ({ request }) => {
  const id = queue("ping", ", 2");
  for (const attempt of [1, 2]) {
    localSql(`update public.jobs set run_after = now() where id = '${id}'`);
    const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: "e2e-first", kinds: ["ping"], limit: 20 } });
    const mine = ((await claim.json()) as { jobs: Array<{ id: string }> }).jobs;
    expect(mine.map((j) => j.id), `attempt ${attempt}`).toContain(id);
    for (const j of mine) {
      await request.post("/api/worker/finish", { headers: bearer, data: { id: j.id, worker: "e2e-first", ok: j.id !== id, error: "the graphics card was busy", result: {} } });
    }
    const state = job(id);
    expect(state.error).toContain("graphics card");
    expect(state.status, `after attempt ${attempt}`).toBe(attempt === 1 ? "queued" : "failed");
  }
});

test("a job of a kind nobody handles is given back with a reason, not lost", async ({ request }) => {
  const id = queue("no-such-kind", ", 1");
  await request.post("/api/worker/claim", { headers: bearer, data: { worker: "e2e-first", kinds: ["no-such-kind"], limit: 20 } });
  const state = job(id);
  expect(state.status).toBe("failed");
  expect(state.error).toContain("no handler");
});

test("a job left by a worker that died becomes claimable again", async ({ request }) => {
  const id = queue("ping");
  await request.post("/api/worker/claim", { headers: bearer, data: { worker: "e2e-first", kinds: ["ping"], limit: 20 } });
  expect(job(id).status).toBe("claimed");
  // The lease runs out (as if the PC was switched off mid-job).
  localSql(`update public.jobs set lease_until = now() - interval '1 minute' where id = '${id}'`);
  const again = await request.post("/api/worker/claim", { headers: bearer, data: { worker: "e2e-second", kinds: ["ping"], limit: 20 } });
  const taken = ((await again.json()) as { jobs: Array<{ id: string }> }).jobs;
  expect(taken.map((j) => j.id)).toContain(id);
  for (const j of taken) await request.post("/api/worker/finish", { headers: bearer, data: { id: j.id, worker: "e2e-second", ok: true, result: {} } });
  expect(job(id).status).toBe("done");
});
