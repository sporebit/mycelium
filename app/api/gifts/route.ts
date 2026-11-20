import { NextRequest, NextResponse } from "next/server";
import { pickPostBody } from "@/lib/capture/registry";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { canSeeOccasion, canSeePerson, createGift, findSimilarGifts, GIFT_SELECT, isUuid } from "@/lib/gifts/server";
import { similarity } from "@/lib/quotes/text";
import { isGiftStatus, type GiftRow } from "@/lib/gifts/types";

export const runtime = "nodejs";

/**
 * GET /api/gifts?q=&person=<id>|none&occasion=<id>|none&status=csv&month=YYYY-MM&include_rejected=1&limit=
 * Soonest needed first, then newest (spec §9). Rejected rows are left out
 * unless asked for (§3.6): they are kept for the suggester, not for the list.
 * Owner-only by policy: the caller only ever sees their own.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const person = sp.get("person");
  const occasion = sp.get("occasion");
  const statuses = (sp.get("status") ?? "").split(",").map((s) => s.trim()).filter(isGiftStatus);
  const month = sp.get("month");
  const includeRejected = sp.get("include_rejected") === "1" || statuses.includes("rejected");
  const limit = Math.min(1000, Math.max(1, Number(sp.get("limit") ?? 500) || 500));
  try {
    const supabase = await createUserClient();
    let query = supabase.from("gifts").select(GIFT_SELECT).order("needed_by", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(q ? 1000 : limit);
    if (person === "none") query = query.is("for_person_id", null);
    else if (isUuid(person)) query = query.eq("for_person_id", person);
    if (occasion === "none") query = query.is("occasion_id", null);
    else if (isUuid(occasion)) query = query.eq("occasion_id", occasion);
    if (statuses.length) query = query.in("status", statuses);
    else if (!includeRejected) query = query.neq("status", "rejected");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const start = `${month}-01`;
      const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
      query = query.gte("needed_by", start).lt("needed_by", end);
    }
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as unknown as GiftRow[];
    auditListRead(req, rows as unknown as Array<{ space_id?: string | null }>, "organisation", "gifts");
    if (q) {
      const needle = q.toLowerCase();
      rows = rows
        .map((r) => {
          const hay = `${r.title} ${r.reason ?? ""} ${r.for_label ?? ""} ${r.description ?? ""}`;
          const score = hay.toLowerCase().includes(needle) ? 1 : Math.max(similarity(q, r.title), similarity(q, r.reason ?? ""));
          return { r, score };
        })
        .filter((x) => x.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.r);
    }
    // comment counts in one query
    if (rows.length) {
      const { data: comments } = await supabase.from("gift_comments").select("gift_id").in("gift_id", rows.map((r) => r.id)).limit(5000);
      const counts = new Map<string, number>();
      for (const c of (comments ?? []) as Array<{ gift_id: string }>) counts.set(c.gift_id, (counts.get(c.gift_id) ?? 0) + 1);
      rows = rows.map((r) => ({ ...r, comment_count: counts.get(r.id) ?? 0 }));
    }
    return NextResponse.json({ gifts: rows });
  } catch (err) {
    console.error("[/api/gifts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  title?: string;
  for_person_id?: string | null;
  for_label?: string | null;
  occasion_id?: string | null;
  reason?: string | null;
  url?: string | null;
  target_price?: number | null;
  needed_by?: string | null;
  description?: string | null;
  retailer?: string | null;
  category?: string | null;
  currency?: string | null;
  status?: string;
  /** Skip the near-duplicate check (the UI sends this after showing the warning). */
  force?: boolean;
};

/** POST — manual create (bypasses review, spec §9). 409 with the matches when a near-duplicate for the same recipient exists and `force` is not set. */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = pickPostBody("gift_idea", await readJson(req)) as CreateBody;
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const personId = isUuid(body.for_person_id) ? body.for_person_id : null;
    if (body.for_person_id && !personId) return NextResponse.json({ error: "for_person_id is a person id" }, { status: 400 });
    if (personId && !(await canSeePerson(supabase, personId))) return NextResponse.json({ error: "No such person." }, { status: 400 });
    const occasionId = isUuid(body.occasion_id) ? body.occasion_id : null;
    if (occasionId && !(await canSeeOccasion(supabase, occasionId))) return NextResponse.json({ error: "No such occasion." }, { status: 400 });
    if (!body.force) {
      const similar = await findSimilarGifts(supabase, title, { for_person_id: personId, for_label: body.for_label ?? null });
      if (similar.length) return NextResponse.json({ error: "near-duplicate", similar }, { status: 409 });
    }
    const row = await createGift(supabase, {
      title,
      for_person_id: personId,
      for_label: body.for_label ?? null,
      occasion_id: occasionId,
      reason: body.reason ?? null,
      url: body.url ?? null,
      target_price: typeof body.target_price === "number" ? body.target_price : null,
      needed_by: body.needed_by ?? null,
      description: body.description ?? null,
      retailer: body.retailer ?? null,
      category: body.category ?? null,
      currency: body.currency ?? null,
      status: isGiftStatus(body.status) && body.status !== "rejected" ? body.status : "idea",
      origin: "manual",
    });
    return NextResponse.json({ gift: row }, { status: 201 });
  } catch (err) {
    console.error("[/api/gifts POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "create failed" }, { status: 500 });
  }
}
