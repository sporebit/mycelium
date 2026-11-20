/**
 * Mycelium PC worker (master run §9).
 *
 * The PC collects work from the cloud: once a minute it asks Mycelium for
 * jobs, does them here (Whisper on the graphics card, a local language
 * model through Ollama, Kokoro for the spoken voice, the reference store for
 * bulk data kept off the hosted database), and posts the results back.
 * Nothing on the home network is exposed: every connection is made
 * outwards, by this script.
 *
 *   node pc-worker/worker.mjs            run until stopped
 *   node pc-worker/worker.mjs --once     one round, then exit (for testing)
 *   node pc-worker/worker.mjs --selftest check Whisper and Ollama, then exit
 *
 * Settings come from the repo's .env.local (CRON_SECRET is the worker's
 * key) and may be overridden by pc-worker/config.json:
 *   { "url": "https://mycelium.sporebit.com", "name": "desktop",
 *     "pollSeconds": 60, "ollamaUrl": "http://127.0.0.1:11434",
 *     "ollamaModel": "qwen2.5:7b", "whisperModel": "large-v3-turbo",
 *     "voice": "bf_emma" }
 *
 * Log: %LOCALAPPDATA%\Mycelium\pc-worker.log (kept under 2 MB).
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as reference from "./reference.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const ONCE = process.argv.includes("--once");
const SELFTEST = process.argv.includes("--selftest");

// ---------------------------------------------------------------------------
// Settings

function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}
const env = { ...readEnvFile(path.join(ROOT, ".env.local")), ...process.env };

/**
 * Every value a key has in the env file, in file order. .env.local can hold
 * the same key twice (an old value left beside a new one); only one of them
 * is the one production accepts, so the worker tries each in turn on a 401.
 */
function allValues(file, key) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.startsWith(key + "=")) out.push(line.slice(key.length + 1).replace(/^"(.*)"$/, "$1"));
  }
  return [...new Set(out.filter(Boolean))];
}
const fileConfig = existsSync(path.join(HERE, "config.json")) ? JSON.parse(readFileSync(path.join(HERE, "config.json"), "utf8")) : {};
const config = {
  url: process.env.MYCELIUM_WORKER_URL ?? fileConfig.url ?? "https://mycelium.sporebit.com",
  name: process.env.MYCELIUM_WORKER_NAME ?? fileConfig.name ?? os.hostname().toLowerCase(),
  pollSeconds: fileConfig.pollSeconds ?? 60,
  ollamaUrl: fileConfig.ollamaUrl ?? "http://127.0.0.1:11434",
  ollamaModel: fileConfig.ollamaModel ?? "qwen2.5:7b",
  whisperModel: fileConfig.whisperModel ?? "large-v3-turbo",
  voice: fileConfig.voice ?? "bf_emma",
};
const SECRETS = process.env.MYCELIUM_WORKER_SECRET ? [process.env.MYCELIUM_WORKER_SECRET] : allValues(path.join(ROOT, ".env.local"), "CRON_SECRET");
let secretIndex = 0;
const PYTHON = path.join(HERE, ".venv", "Scripts", "python.exe");
// Kokoro's two model files (pc-worker/setup.ps1 fetches them; speak.py reads the same place).
const KOKORO_DIR = process.env.MYCELIUM_KOKORO_DIR ?? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "Mycelium", "models", "kokoro");
const STARTED_AT = new Date().toISOString();

// ---------------------------------------------------------------------------
// Log

const LOG_DIR = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "Mycelium");
const LOG_FILE = path.join(LOG_DIR, "pc-worker.log");
function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > 2 * 1024 * 1024) renameSync(LOG_FILE, LOG_FILE + ".1");
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* a full disk must not stop the worker */
  }
}

// ---------------------------------------------------------------------------
// What this PC can do

function run(file, args, { timeoutMs = 600_000, env: extraEnv, cwd, shell = false } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true, cwd, shell, env: { ...process.env, PYTHONIOENCODING: "utf-8", ...extraEnv } }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), error });
    });
  });
}

async function ollamaUp() {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.json();
    return (body.models ?? []).some((m) => m.name === config.ollamaModel || m.name?.startsWith(config.ollamaModel + ":"));
  } catch {
    return false;
  }
}

async function gpuInfo() {
  const r = await run("nvidia-smi", ["--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"], { timeoutMs: 5000 });
  if (!r.ok) return null;
  const [name, total, used] = r.stdout.trim().split(/\s*,\s*/);
  return { name, memory_mb: Number(total), used_mb: Number(used) };
}

function kokoroReady() {
  return existsSync(PYTHON) && existsSync(path.join(HERE, "speak.py")) && existsSync(path.join(KOKORO_DIR, "kokoro-v1.0.onnx")) && existsSync(path.join(KOKORO_DIR, "voices-v1.0.bin"));
}

async function capabilities() {
  const whisper = existsSync(PYTHON) && existsSync(path.join(HERE, "transcribe.py"));
  const llm = await ollamaUp();
  const voice = kokoroReady();
  const store = reference.available();
  const kinds = ["ping"];
  if (whisper) kinds.push("transcribe");
  if (llm) kinds.push("classify", "llm", "first_steps", "finds_verdict");
  // `npm audit --json` in this checkout (the Finds feed, lib/finds/audit.ts): a package.json beside pc-worker/.
  if (existsSync(path.join(HERE, "..", "package-lock.json"))) kinds.push("npm_audit");
  // The spoken voice (lib/speech/server.ts) and the reference store (lib/reference/jobs.ts).
  if (voice) kinds.push("speak");
  if (store) kinds.push("reference_offload", "reference_get");
  return {
    kinds,
    whisper,
    llm,
    voice,
    reference_store: store ? reference.status() : null,
    whisper_model: whisper ? config.whisperModel : null,
    llm_model: llm ? config.ollamaModel : null,
    voice_name: voice ? config.voice : null,
  };
}

// ---------------------------------------------------------------------------
// Jobs

const TMP = path.join(os.tmpdir(), "mycelium-worker");

async function transcribe(payload) {
  if (typeof payload.audio_url !== "string") throw new Error("no audio_url in the job");
  mkdirSync(TMP, { recursive: true });
  const ext = String(payload.audio_ext ?? "m4a").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "m4a";
  const file = path.join(TMP, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  try {
    const res = await fetch(payload.audio_url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`audio download ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const args = [path.join(HERE, "transcribe.py"), file, "--model", config.whisperModel];
    if (typeof payload.language === "string" && payload.language) args.push("--language", payload.language);
    const r = await run(PYTHON, args, { timeoutMs: 900_000 });
    const line = r.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
    let out;
    try {
      out = JSON.parse(line);
    } catch {
      throw new Error(`whisper gave no result: ${(r.stderr || r.stdout).slice(-300)}`);
    }
    if (out.error) throw new Error(`whisper: ${out.error}`);
    return out;
  } finally {
    try {
      unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

/** One chat completion from the local model. `payload`: { system, user, json?, max_tokens? } */
async function llm(payload) {
  if (typeof payload.user !== "string") throw new Error("no prompt in the job");
  const started = Date.now();
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      format: payload.json === false ? undefined : "json",
      options: { temperature: 0.1, num_predict: typeof payload.max_tokens === "number" ? payload.max_tokens : 1024, num_ctx: 8192 },
      messages: [...(typeof payload.system === "string" ? [{ role: "system", content: payload.system }] : []), { role: "user", content: payload.user }],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const body = await res.json();
  return { text: body.message?.content ?? "", model: config.ollamaModel, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

/**
 * `npm audit --json` in the repo checkout this worker lives in (the Finds
 * feed, lib/finds/audit.ts). Reads the lockfile only; installs nothing and
 * changes nothing. npm exits 1 when it finds something, so the exit code is
 * not an error here: the JSON is the result either way. On Windows npm is
 * a .cmd, which needs a shell to start.
 */
async function npmAudit() {
  const repo = path.join(HERE, "..");
  const r = await run("npm", ["audit", "--json", "--omit=dev"], { timeoutMs: 180_000, cwd: repo, shell: process.platform === "win32", env: { npm_config_fund: "false", npm_config_update_notifier: "false" } });
  const text = r.stdout.trim();
  if (!text.startsWith("{")) throw new Error(`npm audit gave no JSON: ${(r.stderr || r.stdout).slice(-300)}`);
  return { audit: text.slice(0, 2_000_000), at: new Date().toISOString() };
}

/**
 * One spoken line (lib/speech/server.ts): the words in, a WAV rendered by
 * Kokoro on this PC, put straight into the app's bucket through the signed
 * link the cloud made. `payload`: { text, voice, upload_url, path } or
 * { already: true } when another worker got there first.
 */
async function speak(payload) {
  if (payload.already === true) return { already: true };
  if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("no text in the job");
  if (typeof payload.upload_url !== "string") throw new Error("no upload link in the job");
  mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`);
  try {
    const voice = /^[a-z]{2}_[a-z]+$/.test(String(payload.voice ?? "")) ? payload.voice : config.voice;
    const out = await new Promise((resolve) => {
      const child = execFile(PYTHON, [path.join(HERE, "speak.py"), "--out", file, "--voice", voice], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", MYCELIUM_KOKORO_DIR: KOKORO_DIR } }, (error, stdout, stderr) =>
        resolve({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }),
      );
      child.stdin.end(payload.text);
    });
    const line = out.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
    let info;
    try {
      info = JSON.parse(line);
    } catch {
      throw new Error(`speak gave no result: ${(out.stderr || out.stdout).slice(-300)}`);
    }
    if (info.error) throw new Error(`speak: ${info.error}`);
    const wav = readFileSync(file);
    const res = await fetch(payload.upload_url, { method: "PUT", headers: { "content-type": "audio/wav", "x-upsert": "true" }, body: wav, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { seconds: info.seconds, bytes: wav.length, sample_rate: info.sample_rate, voice, render_seconds: info.render_seconds };
  } finally {
    try {
      unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

const RUNNERS = {
  ping: async () => ({ pong: true, at: new Date().toISOString() }),
  transcribe,
  classify: llm,
  llm,
  // First steps for tomorrow's tasks (lib/daily/firstSteps.ts): a prompt in, text out; the cloud checks the answer.
  first_steps: llm,
  // A verdict on a find (lib/finds/verdict.ts): the cloud opens the page and writes the prompt as the job is claimed.
  finds_verdict: llm,
  npm_audit: npmAudit,
  speak,
  // Bulk reference data held on this PC instead of the hosted database (pc-worker/reference.mjs).
  reference_offload: reference.offload,
  reference_get: reference.get,
};

// ---------------------------------------------------------------------------
// Talking to Mycelium

async function api(pathname, body) {
  let res;
  for (let tried = 0; tried < SECRETS.length; tried++) {
    res = await fetch(`${config.url}${pathname}`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRETS[secretIndex]}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status !== 401) break;
    // Not the key this server accepts: try the next one and remember which works.
    secretIndex = (secretIndex + 1) % SECRETS.length;
  }
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok && res.status !== 409) throw new Error(`${pathname} ${res.status} ${json.error ?? ""}`);
  return json;
}

/** One round: say what this PC can do, take jobs, do them. Returns how many were taken. */
async function round() {
  const caps = await capabilities();
  const gpu = await gpuInfo();
  const { jobs = [] } = await api("/api/worker/claim", {
    worker: config.name,
    kinds: caps.kinds,
    limit: 4,
    capabilities: caps,
    info: { gpu, platform: `${os.platform()} ${os.release()}`, node: process.version },
    started_at: STARTED_AT,
  });
  for (const job of jobs) {
    const runner = RUNNERS[job.kind];
    const t0 = Date.now();
    try {
      if (!runner) throw new Error(`this worker cannot do "${job.kind}"`);
      const result = await runner(job.payload ?? {});
      const done = await api("/api/worker/finish", { id: job.id, worker: config.name, ok: true, result });
      log(`${job.kind} ${job.id.slice(0, 8)} done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${done.status ?? "?"})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`${job.kind} ${job.id.slice(0, 8)} FAILED: ${message}`);
      await api("/api/worker/finish", { id: job.id, worker: config.name, ok: false, error: message.slice(0, 1500) }).catch((e) => log(`could not report the failure: ${e.message}`));
    }
  }
  return jobs.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The five-minute knock
//
// Vercel's free plan runs a job once a day at most. Everything that must
// happen during the day (reminders, the Day log prompt, the morning and
// evening prompts, check-ins, quote research, rundowns) hangs off one
// route, /api/cron/tick, which works out for itself what is due. This PC
// knocks on it once per five-minute slot while it is on.

const TICK_MS = 5 * 60_000;
const TICK_ON = process.env.MYCELIUM_WORKER_TICK !== "0" && !ONCE;
let lastSlot = -1;

async function tick() {
  if (!TICK_ON) return;
  const slot = Math.floor(Date.now() / TICK_MS);
  if (slot === lastSlot) return;
  lastSlot = slot;
  try {
    const res = await api("/api/cron/tick", {});
    const bad = (res.ran ?? []).filter((r) => r.status >= 400);
    // Quiet when all is well: a line only for a job that failed.
    for (const r of bad) log(`tick: ${r.path} answered ${r.status} after ${r.ms}ms`);
  } catch (err) {
    log(`tick failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// Saying so when it cannot work
//
// A worker that is refused (a wrong or rotated key) will be refused for
// ever, and nobody reads its log: on 2026-11-20 it failed for ninety
// minutes before anyone looked. A refusal is reported once, by Telegram
// straight from this PC (the app is the thing that is not answering).

let complained = false;
function complainOnce(message) {
  if (complained || /localhost|127.0.0.1/.test(config.url)) return;
  complained = true;
  const script = path.join(ROOT, "scripts", "run-notify.mjs");
  if (!existsSync(script)) return;
  execFile(process.execPath, [script, `The PC worker cannot reach Mycelium: ${message}. Captured audio waits on the PC until this is fixed. Log: pc-worker.log in the Mycelium folder under %LOCALAPPDATA%`], { windowsHide: true, timeout: 60_000 }, () => undefined);
}

async function main() {
  if (!SECRETS.length) {
    log("CRON_SECRET is missing from .env.local; the worker cannot sign its requests. Stopping.");
    process.exit(1);
  }
  if (SELFTEST) {
    const caps = await capabilities();
    console.log(JSON.stringify({ url: config.url, name: config.name, ...caps, gpu: await gpuInfo() }, null, 2));
    return;
  }
  log(`worker "${config.name}" started; collecting from ${config.url} every ${config.pollSeconds}s`);
  let failures = 0;
  for (;;) {
    let took = 0;
    try {
      took = await round();
      failures = 0;
      complained = false;
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      // One line per failure for the first few, then once every ten, so an offline night does not fill the log.
      if (failures <= 3 || failures % 10 === 0) log(`round failed (${failures}): ${message}`);
      // Refused three times running is not a blip. (Offline is not reported: there is nothing to send it with.)
      if (failures === 3 && / 40[13] /.test(` ${message} `)) complainOnce(message.slice(0, 120));
    }
    if (failures === 0) await tick();
    if (ONCE) return;
    // More work may be waiting: go straight round again. Otherwise wait, longer while the cloud is unreachable.
    if (took === 0) await sleep(Math.min(config.pollSeconds * (failures > 3 ? 5 : 1), 600) * 1000);
  }
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
