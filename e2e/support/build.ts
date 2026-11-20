/**
 * Builds and serves a COMPILED copy of the app for end-to-end runs.
 *
 *   node e2e/support/build.ts                 build into .next-e2e-prod, then serve on the e2e port
 *   node e2e/support/build.ts --serve         serve the last build without rebuilding
 *   node e2e/support/build.ts --build-only    build and stop (to swap under a running server)
 *   … --dist .next-e2e-prod-b                 use another folder: build the next one beside the
 *                                             one being served, then restart on it
 *
 * `next dev` compiles each route the first time it is asked for and keeps
 * everything in memory; with several spec runs sharing one server it slows
 * to a crawl and then runs out of heap. A compiled build answers in
 * milliseconds and is closer to what production runs. The price: a change
 * to app code is not live until the next build. Spec files need no rebuild.
 *
 * Same environment as the dev server: local stack, paid keys blank.
 * Lint is skipped here (the production gate is the release build in
 * scripts/ship.sh, which skips nothing).
 */
import { spawnSync, spawn } from "node:child_process";
import { E2E_PORT, e2eServerEnv } from "./env.ts";

const distArg = process.argv.indexOf("--dist");
const dist = distArg > 0 ? process.argv[distArg + 1] : ".next-e2e-prod";
if (!dist.startsWith(".next-e2e-prod") || dist.includes("/") || dist.includes("..")) throw new Error("--dist must be a .next-e2e-prod* folder");
const env = { ...process.env, ...e2eServerEnv(), NEXT_DIST_DIR: dist, E2E_BUILD: "1", NODE_OPTIONS: "--max-old-space-size=8192" };

if (!process.argv.includes("--serve")) {
  const built = spawnSync("npx", ["next", "build", "--no-lint"], { stdio: "inherit", shell: true, env });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
if (process.argv.includes("--build-only")) process.exit(0);
const child = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
