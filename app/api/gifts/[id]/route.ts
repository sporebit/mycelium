import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { todayLondon } from "@/lib/tickets/when";
import { canSeeOccasion, canSeePerson, completeReminderTask, GIFT_SELECT, isUuid } from "@/lib/gifts/server";
import { isGiftStatus, type GiftRow } from "@/lib/gifts/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("gifts").select(GIFT_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { count } = await supabase.from("gift_comments").select("id", { count: "exact", head: true }).eq("gift_id", id);
    return NextResponse.json({ gift: { ...(data as unknown as GiftRow), comment_count: count ?? 0 } });
  } catch (err) {
    console.error("[/api/gifts/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** PATCH whitelist (spec §9). */
const WHITELIST = ["title", "description", "reason", "for_person_id", "for_label", "occasion_id", "needed_by", "status", "rejected_reason", "url", "retailer", "category", "target_price", "paid_amount", "paid_at", "given_at", "bundle_id"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const update: Record<string, unknown> = {};
  for (const k of WHITELIST) {
    if (!(k in body)) continue;
    const v = body[k];
    switch (k) {
      case "title":
        if (typeof v !== "string" || !v.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
        update.title = v.trim().slice(0, 200);
        break;
      case "description":
      case "reason":
      case "for_label":
      case "rejected_reason":
      case "url":
      case "retailer":
      case "category":
        update[k] = typeof v === "string" && v.trim() ? v.trim() : null;
        break;
      case "for_person_id":
      case "occasion_id":
      case "bundle_id":
        if (v !== null && !isUuid(v)) return NextResponse.json({ error: `${k} is an id` }, { status: 400 });
        update[k] = v;
        break;
      case "needed_by":
      case "paid_at":
      case "given_at":
        if (v !== null && (typeof v !== "string" || !DATE_RE.test(v))) return NextResponse.json({ error: `${k} is a date, YYYY-MM-DD` }, { status: 400 });
        update[k] = v;
        break;
      case "target_price":
      case "paid_amount":
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) return NextResponse.json({ error: `${k} is a number` }, { status: 400 });
        update[k] = v === null ? null : Math.round(v * 100) / 100;
        break;
      case "status":
        if (!isGiftStatus(v)) return NextResponse.json({ error: "status is one of idea, shortlisted, bought, given, rejected" }, { status: 400 });
        update.status = v;
        break;
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  // a named person wins over a free-text label; given sets given_at; bought sets paid_at (API-set, not a constraint — spec §3.6)
  if (typeof update.for_person_id === "string") update.for_label = null;
  const today = todayLondon();
  if (update.status === "given" && !("given_at" in update)) update.given_at = today;
  if (update.status === "bought" && !("paid_at" in update)) update.paid_at = today;
  update.updated_at = new Date().toISOString();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (typeof update.for_person_id === "string" && !(await canSeePerson(supabase, update.for_person_id))) return NextResponse.json({ error: "No such person." }, { status: 400 });
    if (typeof update.occasion_id === "string" && !(await canSeeOccasion(supabase, update.occasion_id))) return NextResponse.json({ error: "No such occasion." }, { status: 400 });
    if (update.status === "given" && update.given_at === undefined) {
      const { data: cur } = await supabase.from("gifts").select("given_at").eq("id", id).maybeSingle();
      if (!(cur as { given_at: string | null } | null)?.given_at) update.given_at = today;
    }
    const { data, error } = await supabase.from("gifts").update(update).eq("id", id).select(GIFT_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const row = data as unknown as GiftRow;
    if (update.status === "bought" || update.status === "given") await completeReminderTask(supabase, row.occasion_id);
    return NextResponse.json({ gift: row });
  } catch (err) {
    console.error("[/api/gifts/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

/**
 * DELETE — removes an idea outright. A rejected gift is meant to be kept
 * (spec §12 flag 6); the UI offers Reject, not Delete, for one that has been
 * considered. The route still deletes what it is asked to, so a test or a
 * mistake can be cleaned up.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error, count } = await supabase.from("gifts").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/gifts/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
