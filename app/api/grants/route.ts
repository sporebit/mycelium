import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { GROUPS_BY_SECTION, SHAREABLE_SECTIONS, VERBS, listGrants, rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

/** Grants I have given and grants I have received (active only). */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  try {
    return NextResponse.json(await listGrants(db, me.id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}

/**
 * Share part of MY personal space with a person: { grantee_id, section,
 * entity_groups?, verbs, expires_at?, reason? }. Finance and platform are
 * not offered here and are refused by the table's constraint anyway.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const grantee = typeof body.grantee_id === "string" ? body.grantee_id : "";
  const section = typeof body.section === "string" ? body.section : "";
  const groups = Array.isArray(body.entity_groups) ? body.entity_groups.filter((g) => typeof g === "string") : [];
  const verbs = Array.isArray(body.verbs) ? body.verbs.filter((v) => typeof v === "string") : [];
  const expires = typeof body.expires_at === "string" && body.expires_at ? body.expires_at : null;
  const reason = typeof body.reason === "string" && body.reason ? body.reason : null;

  if (!grantee) return NextResponse.json({ error: "grantee_id is required" }, { status: 400 });
  if (!SHAREABLE_SECTIONS.includes(section as never)) {
    return NextResponse.json({ error: "section cannot be shared" }, { status: 400 });
  }
  if (groups.some((g) => !GROUPS_BY_SECTION[section]?.includes(g as string))) {
    return NextResponse.json({ error: "unknown entity group for section" }, { status: 400 });
  }
  if (verbs.length === 0 || verbs.some((v) => !(VERBS as readonly string[]).includes(v as string))) {
    return NextResponse.json({ error: "verbs must be a non-empty subset of view, edit, create_delete, share" }, { status: 400 });
  }

  const db = await createUserClient();
  const { data, error } = await db.rpc("create_user_grant", {
    p_grantee: grantee,
    p_section: section,
    p_entity_groups: groups,
    p_verbs: verbs,
    p_expires_at: expires,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 400 });
  return NextResponse.json({ id: data }, { status: 201 });
}
