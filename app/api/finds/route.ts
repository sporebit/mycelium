import { NextRequest, NextResponse } from "next/server";
import { findFromCapture } from "@/lib/finds/capture";
import { listFinds } from "@/lib/finds/store";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** GET /api/finds?days=7 — the person's finds of the last `days` days (1–90), newest first. */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const asked = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = Number.isFinite(asked) ? Math.min(90, Math.max(1, Math.round(asked))) : 7;
  try {
    const finds = await listFinds(await createUserClient(), { days });
    return NextResponse.json({ days, finds });
  } catch (err) {
    console.error("[/api/finds GET]", err);
    return bad("fetch failed", 500);
  }
}

/** POST { url, title? } — keep a link by hand. The same link twice is the same find. */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body || typeof body.url !== "string" || !body.url.trim()) return bad("A link is needed.");
  try {
    const find = await findFromCapture(await createUserClient(), body.url.trim(), { title: typeof body.title === "string" ? body.title : null });
    if (!find) return bad("That is not a web link.");
    return NextResponse.json({ find });
  } catch (err) {
    console.error("[/api/finds POST]", err);
    return bad("That did not save.", 500);
  }
}
