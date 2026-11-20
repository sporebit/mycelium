/**
 * Rebuild the compiled end-to-end server and swap it in, in one command.
 *
 *   node e2e/support/cycle.ts          build into the folder not being served, then swap
 *   node e2e/support/cycle.ts --swap   swap to the other folder without building (it must hold a finished build)
 *
 * Two build folders take turns (.next-e2e-prod and .next-e2e-prod-b), so a
 * build never writes under the server that is answering. The swap is a few
 * seconds of "connection refused"; Playwright runs wait that out
 * (e2e/support/global-setup.ts). Which folder is live is kept in
 * e2e/.results/serving.txt. If the build fails, nothing is swapped and the
 * old server keeps running.
 *
 * The new server is started detached, so it outlives this script. Stop it
 * with:  node e2e/support/cycle.ts --stop
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { E2E_ORIGIN, E2E_PORT, e2eServerEnv } from "./env.ts";

const ROOT = process.cwd();
const STATE = path.join(ROOT, "e2e/.results/serving.txt");
const DISTS = [".next-e2e-prod", ".next-e2e-prod-b"];
const args = process.argv.slice(2);

function serving(): string | null {
  return existsSync(STATE) ? readFileSync(STATE, "utf8").trim() || null : null;
}

function stopServer(): void {
  // Whatever holds the port, and its launcher (npx wraps the real server).
  const script = `$c = Get-NetTCPConnection -LocalPort ${E2E_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; Stop-Process -Id $c.OwningProcess -Force; if ($p) { Stop-Process -Id $p.ParentProcessId -Force -ErrorAction SilentlyContinue } }`;
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
  } catch {
    /* nothing was listening */
  }
}

async function up(): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${E2E_ORIGIN}/api/health`, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return true;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

const env = (dist: string) => ({ ...process.env, ...e2eServerEnv(), NEXT_DIST_DIR: dist, E2E_BUILD: "1", NODE_OPTIONS: "--max-old-space-size=8192" });

if (args.includes("--stop")) {
  stopServer();
  console.log("stopped");
  process.exit(0);
}

const live = serving();
const next = DISTS.find((d) => d !== live) ?? DISTS[0];

if (!args.includes("--swap")) {
  const started = new Date();
  const built = spawnSync("npx", ["next", "build", "--no-lint"], { shell: true, env: env(next), encoding: "utf8" });
  if (built.status !== 0) {
    const out = `${built.stdout ?? ""}${built.stderr ?? ""}`;
    console.log(out.split(/\r?\n/).filter((l) => /Type error|Failed|error TS|Error:|\.tsx?:\d+/.test(l)).slice(0, 15).join("\n"));
    console.log(`BUILD FAILED; still serving ${live ?? "(nothing)"}`);
    process.exit(1);
  }
  console.log(`built ${next} from the tree at ${started.toTimeString().slice(0, 8)}`);
} else if (!existsSync(path.join(ROOT, next, "BUILD_ID"))) {
  console.log(`${next} holds no finished build`);
  process.exit(1);
}

stopServer();
mkdirSync(path.dirname(STATE), { recursive: true });
const log = openSync(path.join(ROOT, "e2e/.results/server.log"), "a");
const child = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], { shell: true, env: env(next), detached: true, stdio: ["ignore", log, log], windowsHide: true });
child.unref();
if (await up()) {
  writeFileSync(STATE, next);
  console.log(`serving ${next} at ${new Date().toTimeString().slice(0, 8)}`);
  process.exit(0);
}
console.log("the new server did not answer within 40 seconds");
process.exit(1);
