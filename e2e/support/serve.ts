/**
 * Starts the end-to-end dev server by hand, with the same environment
 * Playwright would give it (local stack, paid keys blank) and a larger heap.
 *
 *   node e2e/support/serve.ts
 *
 * Playwright reuses a server already answering on the port, so start this
 * first when several spec runs will share one server: `next dev` compiling
 * many routes at once outgrows Node's default heap and stops answering.
 */
import { spawn } from "node:child_process";
import { E2E_PORT, e2eServerEnv } from "./env.ts";

const child = spawn("npx", ["next", "dev", "-p", String(E2E_PORT)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...e2eServerEnv(), NODE_OPTIONS: "--max-old-space-size=12288" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
