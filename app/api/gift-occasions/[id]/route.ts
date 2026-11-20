import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { canSeePerson, GIFT_SELECT, isUuid, OCCASION_SELECT } from "@/lib/gifts/server";
import { occasionTotals } from "@/lib/gifts/money";
import { isOccasionKind, type GiftRow, type OccasionRow } from "@/lib/gifts/types";
import { cleanLeadDays } from "../route";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET — the occasion with its gifts (rejected included, marked), totals, and next year's instance when it exists (spec §10). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("gift_occasions").select(OCCASION_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const occasion = data as unknown as OccasionRow;
    const [{ data: gifts }, { data: next }] = await Promise.all([
      supabase.from("gifts").select(GIFT_SELECT).eq("occasion_id", id).order("status").order("created_at", { ascending: false }).limit(500),
      supabase.from("gift_occasions").select("id, name, occurs_on").eq("previous_occasion_id", id).is("archived_at", null).limit(1),
    ]);
    const rows = (gifts ?? []) as unknown as GiftRow[];
    return NextResponse.json({ occasion, gifts: rows, totals: occasionTotals(rows, occasion.budget), next: ((next ?? []) as Array<{ id: string; name: string; occurs_on: string }>)[0] ?? null });
  } catch (err) {
    console.error("[/api/gift-occasions/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

const WHITELIST = ["name", "kind", "person_id", "occurs_on", "recurrence", "budget", "lead_days", "notes", "archived_at"] as const;

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
      case "name":
        if (typeof v !== "string" || !v.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
        update.name = v.trim().slice(0, 160);
        break;
      case "kind":
        if (!isOccasionKind(v)) return NextResponse.json({ error: "kind is not one of the occasion kinds" }, { status: 400 });
        update.kind = v;
        break;
      case "person_id":
        if (v !== null && !isUuid(v)) return NextResponse.json({ error: "person_id is a person id" }, { status: 400 });
        update.person_id = v;
        break;
      case "occurs_on":
        if (typeof v !== "string" || !DATE_RE.test(v)) return NextResponse.json({ error: "occurs_on is a date, YYYY-MM-DD" }, { status: 400 });
        update.occurs_on = v;
        break;
      case "recurrence":
        if (v !== "none" && v !== "annual") return NextResponse.json({ error: "recurrence is none or annual" }, { status: 400 });
        update.recurrence = v;
        break;
      case "budget":
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) return NextResponse.json({ error: "budget is a number" }, { status: 400 });
        update.budget = v === null ? null : Math.round(v * 100) / 100;
        break;
      case "lead_days": {
        const days = cleanLeadDays(v);
        if (!days) return NextResponse.json({ error: "lead_days is a list of whole days" }, { status: 400 });
        update.lead_days = days;
        break;
      }
      case "notes":
        update.notes = typeof v === "string" && v.trim() ? v.trim() : null;
        break;
      case "archived_at":
        if (v === null) update.archived_at = null;
        else if (v === true || typeof v === "string") update.archived_at = typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString();
        else return NextResponse.json({ error: "archived_at is a datetime, true or null" }, { status: 400 });
        break;
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  update.updated_at = new Date().toISOString();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (typeof update.person_id === "string" && !(await canSeePerson(supabase, update.person_id))) return NextResponse.json({ error: "No such person." }, { status: 400 });
    const { data, error } = await supabase.from("gift_occasions").update(update).eq("id", id).select(OCCASION_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "There is already an annual occasion of that kind for that person in that year." : error.message }, { status: error.code === "23505" ? 409 : 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ occasion: data });
  } catch (err) {
    console.error("[/api/gift-occasions/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

/** DELETE — removes the occasion; its gifts keep `needed_by` and lose the link (FK set null, spec §3.6). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error, count } = await supabase.from("gift_occasions").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/gift-occasions/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
