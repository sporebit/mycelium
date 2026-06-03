import { getDb, type SyncOp } from "./db";

export async function enqueue(
  clientUuid: string,
  url: string,
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFromIndex("syncQueue", "clientUuid", clientUuid);
  if (existing) return;
  await db.add("syncQueue", {
    clientUuid,
    url,
    method,
    body: JSON.stringify(body),
    createdAt: Date.now(),
    synced: 0,
    retries: 0,
    lastError: null,
  } satisfies Omit<SyncOp, "id">);
}

export async function pendingOps(): Promise<SyncOp[]> {
  const db = await getDb();
  return db.getAllFromIndex("syncQueue", "synced", 0);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("syncQueue", "synced", 0);
}

export async function markSynced(id: number): Promise<void> {
  const db = await getDb();
  const op = await db.get("syncQueue", id);
  if (op) {
    op.synced = 1;
    await db.put("syncQueue", op);
  }
}

export async function markError(id: number, error: string): Promise<void> {
  const db = await getDb();
  const op = await db.get("syncQueue", id);
  if (op) {
    op.retries = (op.retries ?? 0) + 1;
    op.lastError = error;
    await db.put("syncQueue", op);
  }
}

export async function clearSynced(): Promise<void> {
  const db = await getDb();
  const synced = await db.getAllFromIndex("syncQueue", "synced", 1);
  const tx = db.transaction("syncQueue", "readwrite");
  for (const op of synced) {
    if (op.id != null) await tx.store.delete(op.id);
  }
  await tx.done;
}
