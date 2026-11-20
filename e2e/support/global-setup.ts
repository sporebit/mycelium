import { existsSync, statSync } from "node:fs";
import { ensureTess, PHIL, TESS, storageStateFor, writeStorageState, type Person } from "./users.ts";

const FRESH_MS = 20 * 60_000;

/** A session written in the last twenty minutes is reused, so two runs started close together do not rewrite each other's sign-in. */
function isFresh(who: Person): boolean {
  const file = storageStateFor(who);
  return existsSync(file) && Date.now() - statSync(file).mtimeMs < FRESH_MS;
}

/** Runs once before the suite: both people exist and are signed in. */
export default async function globalSetup(): Promise<void> {
  ensureTess();
  for (const who of [PHIL, TESS]) {
    if (!isFresh(who)) await writeStorageState(who);
  }
}
