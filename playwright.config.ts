import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./e2e/support/env.ts";
import { PHIL, TESS, storageStateFor } from "./e2e/support/users.ts";

/**
 * End-to-end checks run against a server on its own port, wired to the LOCAL
 * Supabase stack (Docker + `supabase start`). Nothing here can reach the
 * hosted database or a paid service; see e2e/support/env.ts.
 *
 * Playwright does not start that server. Start it once and leave it up:
 *   node e2e/support/build.ts     a compiled build (use this when several runs share it)
 *   node e2e/support/serve.ts     a dev server (one run at a time; picks up edits live)
 * A run that finds no server waits a minute for one (a swap between builds
 * takes seconds), then stops with that instruction.
 *
 *   npm run e2e                                      everything, as Phil and as Tess
 *   npm run e2e -- --project=phil e2e/work.spec.ts   one file as one person
 *
 * Spec files named *.phil.spec.ts or *.tess.spec.ts run as that person only;
 * plain *.spec.ts files run once as each.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./e2e/support/global-setup.ts",
  // One local database is shared by every spec, as it is for the vitest
  // access suites, so files run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "e2e/.results/results.json" }]],
  outputDir: "e2e/.results/artifacts",
  use: {
    baseURL: E2E_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Europe/London",
    locale: "en-GB",
  },
  projects: [
    {
      name: "phil",
      testIgnore: /.*\.tess\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], storageState: storageStateFor(PHIL) },
    },
    {
      name: "tess",
      testIgnore: /.*\.phil\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], storageState: storageStateFor(TESS) },
    },
  ],
});
