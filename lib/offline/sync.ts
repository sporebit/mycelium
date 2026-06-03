import { pendingOps, markSynced, markError, clearSynced } from "./queue";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

let syncing = false;

export type SyncResult = { processed: number; failed: number };

export async function processQueue(): Promise<SyncResult> {
  if (syncing) return { processed: 0, failed: 0 };
  syncing = true;
  let processed = 0;
  let failed = 0;

  try {
    const ops = await pendingOps();
    for (const op of ops) {
      if (op.retries >= MAX_RETRIES) {
        failed++;
        continue;
      }

      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: { "Content-Type": "application/json" },
          body: op.body,
        });

        if (res.ok || res.status === 409) {
          await markSynced(op.id!);
          processed++;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const text = await res.text().catch(() => "");
          await markError(op.id!, `HTTP ${res.status}: ${text.slice(0, 200)}`);
          failed++;
        } else {
          await markError(op.id!, `HTTP ${res.status}`);
          failed++;
          const delay = Math.min(BASE_DELAY_MS * 2 ** op.retries, 30000);
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (err) {
        await markError(op.id!, err instanceof Error ? err.message : "network");
        failed++;
        break;
      }
    }

    await clearSynced();
  } finally {
    syncing = false;
  }

  return { processed, failed };
}

export function isSyncing(): boolean {
  return syncing;
}
