import { existsSync, statSync } from "node:fs";
import { E2E_ORIGIN } from "./env.ts";
import { ensureTess, PHIL, TESS, storageStateFor, writeStorageState, type Person } from "./users.ts";

const FRESH_MS = 20 * 60_000;

/** A session written in the last twenty minutes is reused, so two runs started close together do not rewrite each other's sign-in. */
function isFresh(who: Person): boolean {
  const file = storageStateFor(who);
  return existsSync(file) && Date.now() - statSync(file).mtimeMs < FRESH_MS;
}

/** The shared server, or a clear instruction. Waits out a swap between builds. */
async function serverUp(): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${E2E_ORIGIN}/api/health`, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`No server on ${E2E_ORIGIN}. Start one and leave it running: node e2e/support/build.ts (compiled) or node e2e/support/serve.ts (dev).`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** Runs once before the suite: the server answers, both people exist and are signed in. */
export default async function globalSetup(): Promise<void> {
  await serverUp();
  ensureTess();
  for (const who of [PHIL, TESS]) {
    if (!isFresh(who)) await writeStorageState(who);
  }
}
