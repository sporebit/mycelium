import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { candidateSpaces, familyCtx, overview, setUpFamily } from "@/lib/family/server";
import { isDate } from "@/lib/family/weeks";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET /api/family — where things stand today in the caller's family space:
 * the week of the pregnancy or the baby's age, what is coming up, this
 * week's letter question, the baby log at a glance. With no family space,
 * `family` is null and `candidates` lists the teams that could become one.
 */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    const supabase = await createUserClient();
    const ctx = await familyCtx(supabase, uid, req.nextUrl.searchParams.get("space"));
    if (!ctx) return NextResponse.json({ family: null, candidates: await candidateSpaces(supabase, uid) });
    return NextResponse.json({ family: await overview(ctx) });
  } catch (err) {
    console.error("[/api/family GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST { action: "setup", space } makes a team's space the family space
 * (with the starter lists). POST { action: "ack" } records that the caller
 * knows everything they add here is seen by everyone in it.
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  try {
    const supabase = await createUserClient();
    if (body.action === "setup") {
      const made = await setUpFamily(supabase, uid, String(body.space ?? ""));
      if (!made.ok) return bad(made.error, made.status);
      const ctx = await familyCtx(supabase, uid, String(body.space));
      return NextResponse.json({ family: ctx ? await overview(ctx) : null }, { status: 201 });
    }
    if (body.action === "ack") {
      const ctx = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
      if (!ctx) return bad("No family space.", 404);
      const { error } = await supabase.from("family_acks").upsert({ space_id: ctx.spaceId, member_id: uid }, { onConflict: "space_id,member_id", ignoreDuplicates: true });
      if (error) return bad(error.code === "42501" ? "Your role in this team cannot do that." : error.message, error.code === "42501" ? 403 : 400);
      return NextResponse.json({ ok: true });
    }
    return bad("action is setup or ack.");
  } catch (err) {
    console.error("[/api/family POST]", err);
    return bad("failed", 500);
  }
}

/** PATCH { due_on?, born_on?, baby_name? } — the dates everything else counts from. */
export async function PATCH(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  try {
    const supabase = await createUserClient();
    const ctx = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!ctx) return bad("No family space.", 404);
    const update: Record<string, unknown> = {};
    for (const key of ["due_on", "born_on"] as const) {
      if (!(key in body)) continue;
      const v = body[key];
      if (v === null || v === "") update[key] = null;
      else if (isDate(v)) update[key] = v;
      else return bad(`${key === "due_on" ? "The due date" : "The birthday"} is a date (YYYY-MM-DD).`);
    }
    if ("baby_name" in body) {
      const n = typeof body.baby_name === "string" ? body.baby_name.trim() : "";
      if (n.length > 80) return bad("The name is at most 80 characters.");
      update.baby_name = n || null;
    }
    if (Object.keys(update).length === 0) return bad("Nothing to change.");
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("family_profile").update(update).eq("id", ctx.profile.id).select("id");
    if (error) return bad(error.message, error.code === "42501" ? 403 : 400);
    if (!data || data.length === 0) return bad("Your role in this team cannot change that.", 403);
    const fresh = await familyCtx(supabase, uid, ctx.spaceId);
    return NextResponse.json({ family: fresh ? await overview(fresh) : null });
  } catch (err) {
    console.error("[/api/family PATCH]", err);
    return bad("failed", 500);
  }
}
