import { describe, expect, it } from "vitest";
import { decodeJwtPayload, mintUserJwt } from "./jwt";

const SECRET = "test-jwt-secret-for-mint";

async function verify(token: string, secret: string): Promise<boolean> {
  const [h, p, s] = token.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(`${h}.${p}`));
}

describe("mintUserJwt", () => {
  it("produces an HS256 token PostgREST would accept: role authenticated, sub, exp", async () => {
    const now = 1_700_000_000_000;
    const token = await mintUserJwt({ sub: "f218ed69-6cbf-49ea-908a-8826f2f1178a", secret: SECRET, now });
    expect(token.split(".")).toHaveLength(3);
    const header = decodeJwtPayload(`x.${token.split(".")[0]}.y`);
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = decodeJwtPayload(token);
    expect(claims.role).toBe("authenticated");
    expect(claims.aud).toBe("authenticated");
    expect(claims.sub).toBe("f218ed69-6cbf-49ea-908a-8826f2f1178a");
    expect(claims.iat).toBe(1_700_000_000);
    expect(claims.exp).toBe(1_700_000_300);
    expect(claims.aal).toBe("aal1");
    expect(await verify(token, SECRET)).toBe(true);
  });

  it("is refused by the wrong secret and honours ttl and issuer", async () => {
    const token = await mintUserJwt({ sub: "u", secret: SECRET, ttlSeconds: 60, issuer: "http://x/auth/v1", email: "u@x" });
    expect(await verify(token, "other")).toBe(false);
    const claims = decodeJwtPayload(token);
    expect(Number(claims.exp) - Number(claims.iat)).toBe(60);
    expect(claims.iss).toBe("http://x/auth/v1");
    expect(claims.email).toBe("u@x");
  });
});
