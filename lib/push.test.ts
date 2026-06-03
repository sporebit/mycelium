import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock web-push before importing the module under test
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Mock supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

import webpush from "web-push";
import { upsertSubscription, sendToUser } from "./push";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable = {
    upsert: vi.fn().mockReturnValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  };
}

describe("upsertSubscription", () => {
  it("upserts a subscription with the correct payload", async () => {
    const sb = mockSupabase();
    const result = await upsertSubscription(sb as never, "user-1", {
      endpoint: "https://push.example.com/1",
      p256dh: "key-p256dh",
      auth: "key-auth",
      userAgent: "TestBrowser/1.0",
    });

    expect(result.ok).toBe(true);
    expect(sb.from).toHaveBeenCalledWith("push_subscriptions");
    expect(sb._chain.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        endpoint: "https://push.example.com/1",
        p256dh: "key-p256dh",
        auth: "key-auth",
        user_agent: "TestBrowser/1.0",
      },
      { onConflict: "endpoint" },
    );
  });

  it("returns error when upsert fails", async () => {
    const sb = mockSupabase({
      upsert: vi.fn().mockReturnValue({ error: { message: "DB error" } }),
    });
    const result = await upsertSubscription(sb as never, "user-1", {
      endpoint: "https://push.example.com/1",
      p256dh: "k1",
      auth: "k2",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("DB error");
  });
});

describe("sendToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends to all subscriptions and returns count", async () => {
    const subs = [
      { id: "s1", endpoint: "https://push.example.com/1", p256dh: "k1", auth: "a1" },
      { id: "s2", endpoint: "https://push.example.com/2", p256dh: "k2", auth: "a2" },
    ];
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ data: subs }),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    };
    const sb = { from: vi.fn(() => chainable) };

    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    const result = await sendToUser(sb as never, "user-1", {
      title: "Test",
      body: "Hello",
    });

    expect(result.sent).toBe(2);
    expect(result.pruned).toBe(0);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("prunes dead subscriptions (410 Gone)", async () => {
    const subs = [
      { id: "s1", endpoint: "https://push.example.com/1", p256dh: "k1", auth: "a1" },
      { id: "s2", endpoint: "https://push.example.com/dead", p256dh: "k2", auth: "a2" },
      { id: "s3", endpoint: "https://push.example.com/gone", p256dh: "k3", auth: "a3" },
    ];
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ data: subs }),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    };
    const sb = { from: vi.fn(() => chainable) };

    vi.mocked(webpush.sendNotification)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 410 });

    const result = await sendToUser(sb as never, "user-1", {
      title: "Test",
      body: "Hello",
    });

    expect(result.sent).toBe(1);
    expect(result.pruned).toBe(2);

    // Verify delete was called with both dead IDs
    const deleteCall = chainable.in.mock.calls[0];
    expect(deleteCall[0]).toBe("id");
    expect(deleteCall[1]).toEqual(["s2", "s3"]);
  });

  it("returns zeros when user has no subscriptions", async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ data: [] }),
    };
    const sb = { from: vi.fn(() => chainable) };

    const result = await sendToUser(sb as never, "user-1", {
      title: "Test",
      body: "Hello",
    });

    expect(result.sent).toBe(0);
    expect(result.pruned).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
