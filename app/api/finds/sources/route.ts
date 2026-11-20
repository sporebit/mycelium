import { NextRequest, NextResponse } from "next/server";
import { addFeed, ensureSources, removeSource, setSource } from "@/lib/finds/sources";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/finds/sources — the person's sources, seeded with the defaults on first read. */
export async function GET() {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    return NextResponse.json({ sources: await ensureSources(await createUserClient()) });
  } catch (err) {
    console.error("[/api/finds/sources GET]", err);
    return bad("fetch failed", 500);
  }
}

/** PUT { id, enabled?, label? } — switch a source on or off, or rename it. */
export async function PUT(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body || typeof body.id !== "string" || !UUID.test(body.id)) return bad("Which source?");
  const patch: { enabled?: boolean; label?: string } = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim().slice(0, 120);
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  try {
    await setSource(await createUserClient(), body.id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finds/sources PUT]", err);
    return bad("That did not save.", 500);
  }
}

/** POST { url, label? } — add a feed (RSS or Atom). */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body || typeof body.url !== "string" || !body.url.trim()) return bad("A feed address is needed.");
  try {
    const source = await addFeed(await createUserClient(), body.url, typeof body.label === "string" ? body.label : undefined);
    return NextResponse.json({ source });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "That did not save.");
  }
}

/** DELETE ?id= — remove a feed. The built-in sources are switched off, not removed. */
export async function DELETE(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("Which source?");
  try {
    await removeSource(await createUserClient(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finds/sources DELETE]", err);
    return bad("That did not delete.", 500);
  }
}
