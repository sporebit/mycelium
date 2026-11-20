import { describe, expect, it } from "vitest";
import { normaliseScopes, tokenAllows, type TokenScopes } from "./apiTokens";

const phone: TokenScopes = normaliseScopes({ projects: [], verbs: ["read", "write"], routes: ["capture", "daily"] });
const tix: TokenScopes = normaliseScopes({ projects: ["MYC"], verbs: ["read", "write"], routes: ["tickets"] });

describe("what an API token may call", () => {
  it("the phone's token reaches the three capture doors and the daily prompts", () => {
    for (const [method, path] of [
      ["POST", "/api/capture"],
      ["POST", "/api/capture-audio"],
      ["POST", "/api/capture-photo"],
      ["POST", "/api/daily/morning"],
      ["POST", "/api/daily/close"],
      ["GET", "/api/daily/say"],
      ["GET", "/api/daily/today"],
    ] as const) {
      expect(tokenAllows(phone, method, path), `${method} ${path}`).toBe(true);
    }
  });

  it("and nothing else: it cannot review captures, read tickets, people or settings", () => {
    for (const [method, path] of [
      ["GET", "/api/captures"],
      ["GET", "/api/captures/review"],
      ["PATCH", "/api/captures/00000000-0000-4000-8000-000000000000/review"],
      ["GET", "/api/tickets"],
      ["POST", "/api/tickets"],
      ["GET", "/api/people"],
      ["GET", "/api/settings"],
      ["GET", "/api/finance/accounts"],
      ["POST", "/api/grants"],
      ["GET", "/api/dailyish"],
    ] as const) {
      expect(tokenAllows(phone, method, path), `${method} ${path}`).toBe(false);
    }
  });

  it("a tickets token cannot capture or prompt", () => {
    expect(tokenAllows(tix, "GET", "/api/tickets")).toBe(true);
    expect(tokenAllows(tix, "POST", "/api/capture")).toBe(false);
    expect(tokenAllows(tix, "POST", "/api/daily/morning")).toBe(false);
  });

  it("a read-only token cannot write", () => {
    const readOnly = normaliseScopes({ verbs: ["read"], routes: ["capture", "daily"] });
    expect(tokenAllows(readOnly, "GET", "/api/daily/say")).toBe(true);
    expect(tokenAllows(readOnly, "POST", "/api/capture")).toBe(false);
  });

  it("an unknown route family is dropped when the token is made", () => {
    expect(normaliseScopes({ routes: ["capture", "everything"] }).routes).toEqual(["capture"]);
  });
});
