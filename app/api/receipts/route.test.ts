import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/user", () => ({ createUserClient: vi.fn() }));
vi.mock("@/lib/system/readAudit", () => ({ auditListRead: vi.fn() }));
vi.mock("@/lib/receipts/parse", () => ({ parseReceipt: vi.fn() }));
vi.mock("@/lib/receipts/upload", () => ({
  validateReceiptFiles: vi.fn(() => null),
  storeReceiptImages: vi.fn(),
}));
vi.mock("@/lib/storage/receipts", () => ({ removeReceiptImages: vi.fn() }));

import { createUserClient } from "@/lib/supabase/user";
import { parseReceipt } from "@/lib/receipts/parse";
import { storeReceiptImages } from "@/lib/receipts/upload";
import { removeReceiptImages } from "@/lib/storage/receipts";
import { POST } from "./route";

type Recorded = { table: string; op: "select" | "insert" | "delete"; filters: Record<string, unknown> };

/**
 * A PostgREST-shaped double that answers by table and operation. The chain is
 * thenable because the route awaits some of its deletes without a terminal.
 */
function makeSupabase(answers: Record<string, unknown>) {
  const calls: Recorded[] = [];
  function from(table: string) {
    const rec: Recorded = { table, op: "select", filters: {} };
    calls.push(rec);
    const result = () => Promise.resolve({ data: answers[`${table}.${rec.op}`] ?? null, error: null });
    const chain = {
      insert: () => {
        rec.op = "insert";
        return chain;
      },
      delete: () => {
        rec.op = "delete";
        return chain;
      },
      select: () => chain,
      eq: (k: string, v: unknown) => {
        rec.filters[k] = v;
        return chain;
      },
      single: result,
      maybeSingle: result,
      then: (ok: (r: unknown) => unknown, err?: (e: unknown) => unknown) => result().then(ok, err),
    };
    return chain;
  }
  return { client: { from }, calls };
}

function upload(answers: Record<string, unknown>) {
  const sb = makeSupabase(answers);
  vi.mocked(createUserClient).mockResolvedValue(sb.client as never);
  const form = new FormData();
  form.append("images", new File([new Uint8Array([1])], "page.png", { type: "image/png" }));
  const req = { formData: async () => form } as never;
  return { res: POST(req), calls: sb.calls };
}

const CREATED = { id: "r-1", status: "uploaded" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST receipt — when the photographs cannot be stored", () => {
  it("leaves no receipt behind: stored pages are taken back, then the row", async () => {
    vi.mocked(storeReceiptImages).mockRejectedValue(new Error("receipt image upload failed: storage is down"));
    const { res, calls } = upload({
      "receipts.insert": CREATED,
      // One page had landed before the failure.
      "receipt_images.delete": [{ storage_path: "r-1/0-abc.png" }],
    });
    const r = await res;

    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "the photos could not be stored, so no receipt was created" });

    const deletes = calls.filter((c) => c.op === "delete");
    // Image rows first, the receipt last: the bucket only lets a file go while
    // its receipt still exists.
    expect(deletes.map((c) => c.table)).toEqual(["receipt_images", "receipts"]);
    expect(deletes[0].filters).toEqual({ receipt_id: "r-1" });
    expect(deletes[1].filters).toEqual({ id: "r-1" });
    expect(removeReceiptImages).toHaveBeenCalledWith(["r-1/0-abc.png"]);
    expect(parseReceipt).not.toHaveBeenCalled();
  });

  it("keeps the receipt when the photographs are stored and only the read fails", async () => {
    vi.mocked(storeReceiptImages).mockResolvedValue(1);
    vi.mocked(parseReceipt).mockResolvedValue({
      status: "failed",
      review_reason: "vision_call_failed",
      parsed_total: null,
      line_count: 0,
    });
    const { res, calls } = upload({ "receipts.insert": CREATED, "receipts.select": { ...CREATED, status: "failed" } });
    const r = await res;

    expect(r.status).toBe(201);
    expect(calls.filter((c) => c.op === "delete")).toEqual([]);
    expect(removeReceiptImages).not.toHaveBeenCalled();
  });
});
