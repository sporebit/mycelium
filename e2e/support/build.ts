/**
 * Builds and serves a COMPILED copy of the app for end-to-end runs.
 *
 *   node e2e/support/build.ts           build into .next-e2e-prod, then serve on the e2e port
 *   node e2e/support/build.ts --serve   serve the last build without rebuilding
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

const env = { ...process.env, ...e2eServerEnv(), NEXT_DIST_DIR: ".next-e2e-prod", NODE_OPTIONS: "--max-old-space-size=8192" };

if (!process.argv.includes("--serve")) {
  const built = spawnSync("npx", ["next", "build", "--no-lint"], { stdio: "inherit", shell: true, env });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const child = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
