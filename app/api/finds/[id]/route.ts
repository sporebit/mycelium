import { NextRequest, NextResponse } from "next/server";
import { answerFind, deleteFind, getFind } from "@/lib/finds/store";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("not found", 404);
  const find = await getFind(await createUserClient(), id);
  return find ? NextResponse.json({ find }) : bad("not found", 404);
}

/** PATCH { answer: "keep" | "skip" | null } — Keep or Skip a find, or clear the answer. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("not found", 404);
  const body = await readJson(req);
  if (!body || !("answer" in body)) return bad("answer is keep, skip or null");
  const answer = body.answer;
  if (answer !== "keep" && answer !== "skip" && answer !== null) return bad("answer is keep, skip or null");
  try {
    const find = await answerFind(await createUserClient(), id, answer);
    return find ? NextResponse.json({ find }) : bad("not found", 404);
  } catch (err) {
    console.error("[/api/finds/[id] PATCH]", err);
    return bad("That did not save.", 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("not found", 404);
  try {
    await deleteFind(await createUserClient(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finds/[id] DELETE]", err);
    return bad("That did not delete.", 500);
  }
}
