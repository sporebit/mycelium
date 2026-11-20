import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { holdingKind, isDay, penceFrom, removeHolding, renameHolding, setFigure } from "@/lib/finance/holdingsServer";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/finance/holdings/[id]
 *   { value_pounds | value_pence, as_of? }   a new figure for the holding on that day (today when none given)
 *   { name?, note? }                          its name or note
 * A holding that is not the caller's is not found: the rules hide it.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("not found", 404);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const pence = penceFrom(body);
  if (pence === "bad") return bad("The figure is an amount.");
  const asOf = typeof body.as_of === "string" ? body.as_of : new Date().toISOString().slice(0, 10);
  if (!isDay(asOf)) return bad("as_of is a day, YYYY-MM-DD.");
  const patch: { name?: string; note?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return bad("A holding has a name.");
    patch.name = name;
  }
  if (body.note === null) patch.note = null;
  else if (typeof body.note === "string") patch.note = body.note.trim().slice(0, 300) || null;
  if (pence === null && Object.keys(patch).length === 0) return bad("nothing to change");
  try {
    const db = await createUserClient();
    const kind = await holdingKind(db, id);
    if (!kind) return bad("not found", 404);
    if (Object.keys(patch).length) await renameHolding(db, id, patch);
    if (pence !== null) await setFigure(db, id, kind, pence, asOf);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/holdings/:id PATCH]", err);
    return bad("That did not save.", 500);
  }
}

/** DELETE /api/finance/holdings/[id] — the holding and every figure it had. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("not found", 404);
  try {
    const db = await createUserClient();
    if (!(await holdingKind(db, id))) return bad("not found", 404);
    await removeHolding(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/holdings/:id DELETE]", err);
    return bad("That did not save.", 500);
  }
}
