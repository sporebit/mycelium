/**
 * Mycelium PC worker (master run §9).
 *
 * The PC collects work from the cloud: once a minute it asks Mycelium for
 * jobs, does them here (Whisper on the graphics card, a local language
 * model through Ollama), and posts the results back. Nothing on the home
 * network is exposed: every connection is made outwards, by this script.
 *
 *   node pc-worker/worker.mjs            run until stopped
 *   node pc-worker/worker.mjs --once     one round, then exit (for testing)
 *   node pc-worker/worker.mjs --selftest check Whisper and Ollama, then exit
 *
 * Settings come from the repo's .env.local (CRON_SECRET is the worker's
 * key) and may be overridden by pc-worker/config.json:
 *   { "url": "https://mycelium.sporebit.com", "name": "desktop",
 *     "pollSeconds": 60, "ollamaUrl": "http://127.0.0.1:11434",
 *     "ollamaModel": "qwen2.5:7b", "whisperModel": "large-v3-turbo" }
 *
 * Log: %LOCALAPPDATA%\Mycelium\pc-worker.log (kept under 2 MB).
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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
};
const SECRETS = process.env.MYCELIUM_WORKER_SECRET ? [process.env.MYCELIUM_WORKER_SECRET] : allValues(path.join(ROOT, ".env.local"), "CRON_SECRET");
let secretIndex = 0;
const PYTHON = path.join(HERE, ".venv", "Scripts", "python.exe");
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

function run(file, args, { timeoutMs = 600_000, env: extraEnv } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", ...extraEnv } }, (error, stdout, stderr) => {
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

async function capabilities() {
  const whisper = existsSync(PYTHON) && existsSync(path.join(HERE, "transcribe.py"));
  const llm = await ollamaUp();
  const kinds = ["ping"];
  if (whisper) kinds.push("transcribe");
  if (llm) kinds.push("classify", "llm");
  return { kinds, whisper, llm, whisper_model: whisper ? config.whisperModel : null, llm_model: llm ? config.ollamaModel : null };
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

const RUNNERS = {
  ping: async () => ({ pong: true, at: new Date().toISOString() }),
  transcribe,
  classify: llm,
  llm,
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
    } catch (err) {
      failures += 1;
      // One line per failure for the first few, then once every ten, so an offline night does not fill the log.
      if (failures <= 3 || failures % 10 === 0) log(`round failed (${failures}): ${err instanceof Error ? err.message : err}`);
    }
    if (ONCE) return;
    // More work may be waiting: go straight round again. Otherwise wait, longer while the cloud is unreachable.
    if (took === 0) await sleep(Math.min(config.pollSeconds * (failures > 3 ? 5 : 1), 600) * 1000);
  }
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
