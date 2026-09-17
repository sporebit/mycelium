import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createUserClient } from "@/lib/supabase/user";
import { PRINCIPAL_HEADER, PRINCIPAL_SCOPES_HEADER } from "@/lib/auth/gate";
import { mintToken, normaliseScopes, sha256Hex } from "@/lib/system/apiTokens";
import { principalUid, readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

const SELECT = "id, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at";

/** Tokens can only be managed by a real session, never by another token. */
async function sessionOnly(): Promise<NextResponse | null> {
  const h = await headers();
  if (h.get(PRINCIPAL_HEADER) !== "user" || h.get(PRINCIPAL_SCOPES_HEADER)) {
    return NextResponse.json({ error: "sign in to manage API tokens" }, { status: 403 });
  }
  return null;
}

/** GET — the caller's tokens (never the secret). */
export async function GET() {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("api_tokens").select(SELECT).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tokens: data ?? [] });
  } catch (err) {
    console.error("[/api/settings/api-tokens GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { name, scopes?, expires_in_days? } — mints a token, returned once. */
export async function POST(req: NextRequest) {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJson<{ name?: string; scopes?: unknown; expires_in_days?: number }>(req);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const token = mintToken();
    const expires =
      typeof body?.expires_in_days === "number" && body.expires_in_days > 0
        ? new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString()
        : null;
    const { data, error } = await supabase
      .from("api_tokens")
      .insert({
        user_id: uid,
        name,
        token_hash: await sha256Hex(token),
        token_prefix: token.slice(4, 12),
        scopes: normaliseScopes(body?.scopes),
        expires_at: expires,
      })
      .select(SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    await supabase.from("audit_log").insert({ action: "api_token_created", resource_type: "api_token", resource_id: data.id, metadata: { name } });
    return NextResponse.json({ token, record: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/settings/api-tokens POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

/** DELETE ?id= — revoke (kept for the audit trail). */
export async function DELETE(req: NextRequest) {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { error } = await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await supabase.from("audit_log").insert({ action: "api_token_revoked", resource_type: "api_token", resource_id: id, metadata: {} });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/settings/api-tokens DELETE]", err);
    return NextResponse.json({ error: "revoke failed" }, { status: 500 });
  }
}
