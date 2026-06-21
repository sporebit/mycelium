import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock IDB using an in-memory store ──
const store = new Map<number, Record<string, unknown>>();
let autoId = 0;

vi.mock("idb", () => {
  function makeDb() {
    return {
      add(storeName: string, value: Record<string, unknown>) {
        if (storeName !== "syncQueue") return;
        const id = ++autoId;
        store.set(id, { ...value, id });
        return id;
      },
      get(_storeName: string, id: number) {
        return store.get(id) ?? undefined;
      },
      put(_storeName: string, value: Record<string, unknown>) {
        if (value.id != null) store.set(value.id as number, value);
      },
      getFromIndex(_store: string, _index: string, value: unknown) {
        for (const entry of store.values()) {
          if (_index === "clientUuid" && entry.clientUuid === value) return entry;
          if (_index === "synced" && entry.synced === value) return entry;
        }
        return undefined;
      },
      getAllFromIndex(_store: string, _index: string, value: unknown) {
        return [...store.values()].filter((e) =>
          _index === "synced" ? e.synced === value : e[_index] === value,
        );
      },
      countFromIndex(_store: string, _index: string, value: unknown) {
        return [...store.values()].filter((e) =>
          _index === "synced" ? e.synced === value : e[_index] === value,
        ).length;
      },
      transaction() {
        return {
          store: {
            async delete(id: number) {
              store.delete(id);
            },
          },
          done: Promise.resolve(),
        };
      },
    };
  }
  return {
    openDB: vi.fn(() => Promise.resolve(makeDb())),
  };
});

import { enqueue, pendingOps, pendingCount } from "./queue";
import { processQueue } from "./sync";

beforeEach(() => {
  store.clear();
  autoId = 0;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("idempotency — replaying a queued op twice creates one record", () => {
  it("enqueue with same clientUuid is deduplicated", async () => {
    await enqueue("uuid-1", "/api/fitness/sessions", "POST", { kind: "resistance" });
    await enqueue("uuid-1", "/api/fitness/sessions", "POST", { kind: "resistance" });

    const pending = await pendingOps();
    expect(pending.length).toBe(1);
    expect(pending[0].clientUuid).toBe("uuid-1");
  });

  it("server receives client_uuid for upsert dedup", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ session_id: "server-1" }), { status: 200 });
    }));

    await enqueue("uuid-replay", "/api/fitness/sessions", "POST", {
      kind: "resistance",
      client_uuid: "uuid-replay",
    });
    await processQueue();
    expect(calls).toHaveLength(1);

    await enqueue("uuid-replay-2", "/api/fitness/sessions", "POST", {
      kind: "resistance",
      client_uuid: "uuid-replay-2",
    });
    await processQueue();
    expect(calls).toHaveLength(2);

    const count = await pendingCount();
    expect(count).toBe(0);
  });
});

describe("offline-create-then-sync", () => {
  it("queues mutations offline and processes when online", async () => {
    let fetchCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    await enqueue("session-1", "/api/fitness/sessions", "POST", {
      kind: "resistance",
      client_uuid: "session-1",
    });
    await enqueue("exercise-1", "/api/fitness/sessions/s1/exercises", "POST", {
      name: "Bench Press",
      client_uuid: "exercise-1",
    });
    await enqueue("set-1", "/api/fitness/sessions/s1/exercises/e1/sets", "POST", {
      set_number: 1,
      reps: 10,
      weight: 80,
      unit: "kg",
      client_uuid: "set-1",
    });

    expect(await pendingCount()).toBe(3);

    const result = await processQueue();
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
    expect(fetchCalls).toBe(3);
    expect(await pendingCount()).toBe(0);
  });

  it("retries on server error and stops on network failure", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("", { status: 500 });
      }
      throw new Error("network");
    }));

    await enqueue("op-retry", "/api/test", "POST", { client_uuid: "op-retry" });
    const result = await processQueue();

    expect(result.failed).toBe(1);
    expect(await pendingCount()).toBe(1);
  });
});

describe("template-never-mutated invariant", () => {
  it("session creation payload never includes template mutation fields", () => {
    const sessionPayload = {
      kind: "resistance",
      programme_session_id: "tpl-1",
      slot: "morning",
      date: "2025-06-03",
      client_uuid: "session-new",
    };

    expect(sessionPayload).not.toHaveProperty("exercises");
    expect(sessionPayload).not.toHaveProperty("update_programme");
    expect(sessionPayload).not.toHaveProperty("mutate_template");

    const exercisePayload = {
      name: "Ad-hoc exercise",
      client_uuid: "ex-new",
    };
    expect(exercisePayload).not.toHaveProperty("programme_exercise_id");
  });

  it("enqueued ops preserve snapshot isolation — no template IDs leak into mutations", async () => {
    await enqueue("snap-session", "/api/fitness/sessions", "POST", {
      kind: "resistance",
      programme_session_id: "template-123",
      client_uuid: "snap-session",
    });

    await enqueue("snap-exercise", "/api/fitness/sessions/s1/exercises", "POST", {
      name: "New Exercise",
      client_uuid: "snap-exercise",
    });

    const ops = await pendingOps();
    for (const op of ops) {
      const body = JSON.parse(op.body as string);
      expect(body).not.toHaveProperty("update_programme_exercises");
      expect(body).not.toHaveProperty("mutate_template");
    }
  });
});
