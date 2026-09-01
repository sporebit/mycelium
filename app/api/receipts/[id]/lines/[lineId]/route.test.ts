import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/lib/supabase/server";
import { PATCH } from "./route";

type Result = { data?: unknown; error?: { message: string } | null };

type Recorded = {
  table: string;
  op: "select" | "update";
  filters: Record<string, unknown>;
  neq?: [string, unknown];
  values?: Record<string, unknown>;
};

/**
 * Minimal PostgREST-shaped double. The builder is thenable because one call in
 * the route awaits the chain directly rather than ending it with maybeSingle(),
 * so both terminals draw from the same scripted sequence.
 */
function makeSupabase(script: Result[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const next = (): Result => script[i++] ?? { data: null };

  function from(table: string) {
    const rec: Recorded = { table, op: "select", filters: {} };
    calls.push(rec);
    const chain = {
      select: () => chain,
      update: (values: Record<string, unknown>) => {
        rec.op = "update";
        rec.values = values;
        return chain;
      },
      eq: (k: string, v: unknown) => {
        rec.filters[k] = v;
        return chain;
      },
      neq: (k: string, v: unknown) => {
        rec.neq = [k, v];
        return chain;
      },
      maybeSingle: () => Promise.resolve(next()),
      then: (ok: (r: Result) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(next()).then(ok, err),
    };
    return chain;
  }

  return { client: { from }, calls };
}

const LINE = { id: "line-1", line_total: 10 };

function call(script: Result[], body: Record<string, unknown> = { line_total: 12 }) {
  const sb = makeSupabase(script);
  vi.mocked(createServerClient).mockReturnValue(sb.client as never);
  const req = { json: async () => body } as never;
  const res = PATCH(req, { params: Promise.resolve({ id: "r-1", lineId: "line-1" }) });
  return { res, calls: sb.calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_ID = "user-1";
});

describe("PATCH receipt line — reparse window", () => {
  it("refuses the edit outright while the receipt is parsing", async () => {
    const { res, calls } = call([
      { data: { id: "r-1", total: 100, status: "parsing", review_reason: null } },
    ]);
    const r = await res;

    expect(r.status).toBe(409);
    // Nothing was written: the line update never ran, so an edit that a reparse
    // would have discarded is not silently accepted.
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
    expect(calls.map((c) => c.table)).toEqual(["receipts"]);
  });

  it("filters the receipt write on status so a reparse starting mid-request cannot be clobbered", async () => {
    const { res, calls } = call([
      { data: { id: "r-1", total: 12, status: "needs_review", review_reason: "total_mismatch" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }] },
      { data: { parsed_total: 12, status: "parsed", review_reason: null } },
    ]);
    await res;

    const write = calls.find((c) => c.table === "receipts" && c.op === "update");
    expect(write?.neq).toEqual(["status", "parsing"]);
    expect(write?.filters.id).toBe("r-1");
  });

  it("reports 409 when the status filter excluded the row", async () => {
    const { res } = call([
      { data: { id: "r-1", total: 12, status: "needs_review", review_reason: "total_mismatch" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }] },
      { data: null }, // a reparse claimed the receipt between the read and the write
    ]);
    const r = await res;

    expect(r.status).toBe(409);
  });

  it("returns the figures that were persisted, not the ones it computed", async () => {
    const { res } = call([
      { data: { id: "r-1", total: 12, status: "needs_review", review_reason: "total_mismatch" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }] },
      // The row that actually came back differs from the computed sum. The
      // response must follow the database, not the local arithmetic.
      { data: { parsed_total: 99.99, status: "needs_review", review_reason: "total_mismatch" } },
    ]);
    const body = (await (await res).json()) as { parsed_total: number; status: string };

    expect(body.parsed_total).toBe(99.99);
    expect(body.status).toBe("needs_review");
  });
});

describe("PATCH receipt line — reconciliation", () => {
  it("recomputes status when the receipt is reconcilable", async () => {
    const { res, calls } = call([
      { data: { id: "r-1", total: 12, status: "needs_review", review_reason: "total_mismatch" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }] },
      { data: { parsed_total: 12, status: "parsed", review_reason: null } },
    ]);
    await res;

    const write = calls.find((c) => c.table === "receipts" && c.op === "update");
    expect(write?.values?.parsed_total).toBe(12);
    expect(write?.values?.status).toBe("parsed");
    expect(write?.values?.review_reason).toBeNull();
  });

  it("still refreshes parsed_total on a no_total receipt without touching its status", async () => {
    // The sum of the lines is meaningful even with nothing to reconcile it
    // against, so the figure keeps up to date while the status stays put.
    const { res, calls } = call([
      { data: { id: "r-1", total: null, status: "needs_review", review_reason: "no_total" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }, { line_total: 3.5 }] },
      { data: { parsed_total: 15.5, status: "needs_review", review_reason: "no_total" } },
    ]);
    await res;

    const write = calls.find((c) => c.table === "receipts" && c.op === "update");
    expect(write?.values?.parsed_total).toBe(15.5);
    expect(write?.values).not.toHaveProperty("status");
    expect(write?.values).not.toHaveProperty("review_reason");
  });

  it("leaves a failed receipt's recorded status alone", async () => {
    const { res, calls } = call([
      { data: { id: "r-1", total: null, status: "failed", review_reason: "no_images" } },
      { data: LINE, error: null },
      { data: [{ line_total: 12 }] },
      { data: { parsed_total: 12, status: "failed", review_reason: "no_images" } },
    ]);
    await res;

    const write = calls.find((c) => c.table === "receipts" && c.op === "update");
    expect(write?.values).not.toHaveProperty("status");
  });
});

describe("PATCH receipt line — request validation", () => {
  it("rejects a body with no allowed fields", async () => {
    const { res } = call([], { receipt_id: "hijack", id: "hijack" });
    expect((await res).status).toBe(400);
  });

  it("404s when the parent receipt is not the caller's", async () => {
    const { res } = call([{ data: null }]);
    expect((await res).status).toBe(404);
  });
});
