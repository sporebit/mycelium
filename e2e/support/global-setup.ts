import { existsSync, readFileSync, statSync } from "node:fs";
import { E2E_ORIGIN } from "./env.ts";
import { ensureTess, PHIL, TESS, storageStateFor, writeStorageState, type Person } from "./users.ts";

const FRESH_MS = 20 * 60_000;

/**
 * A session written in the last twenty minutes is reused, so two runs
 * started close together do not rewrite each other's sign-in. Only if it
 * still works: a suite that signs a person out everywhere (the security
 * checks do) ends the saved session too, and the file's age says nothing
 * about that.
 */
async function isFresh(who: Person): Promise<boolean> {
  const file = storageStateFor(who);
  if (!existsSync(file) || Date.now() - statSync(file).mtimeMs >= FRESH_MS) return false;
  try {
    const state = JSON.parse(readFileSync(file, "utf8")) as { cookies?: Array<{ name: string; value: string }> };
    const cookie = (state.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(`${E2E_ORIGIN}/api/settings/ui-prefs`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return res.status === 200;
  } catch {
    return false;
  }
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
    if (!(await isFresh(who))) await writeStorageState(who);
  }
}
