/**
 * Scoped API tokens (tickets spec §14.4). Lives in lib/system because the
 * middleware has no user session to look a token up with; the service
 * client is fenced to this directory. Edge-safe: Web Crypto only.
 *
 *   token   = "mtk_" + base64url(32 random bytes)     (shown once)
 *   stored  = sha256(token) as hex                    (api_tokens.token_hash)
 *   scopes  = { projects: ["MYC"], verbs: ["read","write"], routes: ["tickets"] }
 */
import { createServiceClient } from "./serviceClient";

export type TokenScopes = { projects: string[]; verbs: Array<"read" | "write">; routes: string[] };
export type TokenPrincipal = { id: string; user_id: string; name: string; scopes: TokenScopes };

export const TOKEN_PREFIX = "mtk_";

/** Route families a token may be limited to; the path prefixes each covers. */
export const TOKEN_ROUTES: Record<string, string[]> = {
  tickets: ["/api/tickets", "/api/projects", "/api/habits", "/api/reminders"],
  people: ["/api/people"],
  capture: ["/api/capture"],
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + b64url(bytes);
}

export function normaliseScopes(v: unknown): TokenScopes {
  const o = (v && typeof v === "object" ? v : {}) as Partial<TokenScopes>;
  const verbs = (Array.isArray(o.verbs) ? o.verbs : ["read", "write"]).filter((x): x is "read" | "write" => x === "read" || x === "write");
  return {
    projects: (Array.isArray(o.projects) ? o.projects : []).filter((x): x is string => typeof x === "string").map((x) => x.toUpperCase()),
    verbs: verbs.length ? verbs : ["read"],
    routes: (Array.isArray(o.routes) ? o.routes : ["tickets"]).filter((x): x is string => typeof x === "string" && x in TOKEN_ROUTES),
  };
}

/** Resolve a bearer token to its principal; null when unknown, revoked or expired. */
export async function resolveApiToken(bearer: string | null | undefined): Promise<TokenPrincipal | null> {
  if (!bearer || !bearer.startsWith(TOKEN_PREFIX) || bearer.length < 20) return null;
  const hash = await sha256Hex(bearer);
  const db = createServiceClient();
  const { data } = await db
    .from("api_tokens")
    .select("id, user_id, name, scopes, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && Date.parse(data.expires_at as string) < Date.now()) return null;
  // last_used_at: best-effort, throttled to once a minute by the caller's cadence
  void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {}, () => {});
  return { id: data.id as string, user_id: data.user_id as string, name: data.name as string, scopes: normaliseScopes(data.scopes) };
}

/** Is this request inside the token's scope? (routes + verbs; projects are checked by the tickets routes). */
export function tokenAllows(scopes: TokenScopes, method: string, pathname: string): boolean {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (write && !scopes.verbs.includes("write")) return false;
  if (!write && !scopes.verbs.includes("read") && !scopes.verbs.includes("write")) return false;
  const prefixes = scopes.routes.flatMap((r) => TOKEN_ROUTES[r] ?? []);
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}
