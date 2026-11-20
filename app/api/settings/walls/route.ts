import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_HEADER, PRINCIPAL_SCOPES_HEADER, PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createWallDevice, listWalls, reopenPairing, revokeWall } from "@/lib/system/wall";

export const runtime = "nodejs";

/** Walls are managed by a real session only, never by a token (a wall could not make another wall). */
async function session(): Promise<string | NextResponse> {
  const h = await headers();
  const uid = h.get(PRINCIPAL_USER_HEADER);
  if (h.get(PRINCIPAL_HEADER) !== "user" || h.has(PRINCIPAL_SCOPES_HEADER) || !uid) {
    return NextResponse.json({ error: "sign in to manage walls" }, { status: 403 });
  }
  return uid;
}

/** GET — the walls of the teams the caller owns or administers. */
export async function GET() {
  const uid = await session();
  if (uid instanceof NextResponse) return uid;
  try {
    return NextResponse.json({ walls: await listWalls(uid) });
  } catch (err) {
    console.error("[settings/walls GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST { space_id, label? }        a new wall for that team's space; answers the pairing code, shown once
 * POST { action: "pair", id }      a fresh code for an existing wall (a new frame, or the old one wiped)
 */
export async function POST(req: NextRequest) {
  const uid = await session();
  if (uid instanceof NextResponse) return uid;
  const body = (await req.json().catch(() => ({}))) as { space_id?: unknown; label?: unknown; action?: unknown; id?: unknown };
  try {
    if (body.action === "pair") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
      const made = await reopenPairing(uid, body.id);
      if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
      return NextResponse.json({ code: made.code, expires_at: made.expires_at, device_id: made.device_id });
    }
    if (typeof body.space_id !== "string") return NextResponse.json({ error: "space_id required" }, { status: 400 });
    const label = (typeof body.label === "string" ? body.label.trim() : "").slice(0, 60) || "Wall";
    const made = await createWallDevice(uid, body.space_id, label);
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
    return NextResponse.json({ code: made.code, expires_at: made.expires_at, device_id: made.device_id }, { status: 201 });
  } catch (err) {
    console.error("[settings/walls POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

/** DELETE ?id= — revoke: the wall stops at its next request. */
export async function DELETE(req: NextRequest) {
  const uid = await session();
  if (uid instanceof NextResponse) return uid;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const done = await revokeWall(uid, id);
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[settings/walls DELETE]", err);
    return NextResponse.json({ error: "revoke failed" }, { status: 500 });
  }
}
