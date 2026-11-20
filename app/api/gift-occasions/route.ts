import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { todayLondon } from "@/lib/tickets/when";
import { canSeePerson, isUuid, listOccasions, OCCASION_SELECT } from "@/lib/gifts/server";
import { occasionTotals } from "@/lib/gifts/money";
import { DEFAULT_LEAD_DAYS, isOccasionKind, type GiftRow, type OccasionRow } from "@/lib/gifts/types";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanLeadDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = Array.from(new Set(v.map((x) => (typeof x === "number" ? x : Number(x))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365))).sort((a, b) => b - a);
  return days.length ? days : null;
}

/**
 * GET /api/gift-occasions?person=<id>&past=1&archived=1&totals=1
 * Upcoming first (spec §9). `totals=1` adds budget vs committed vs paid and
 * the status counts for each, from the caller's gifts.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const supabase = await createUserClient();
    const rows = await listOccasions(supabase, {
      includePast: sp.get("past") === "1",
      includeArchived: sp.get("archived") === "1",
      personId: isUuid(sp.get("person")) ? sp.get("person") : null,
    });
    auditListRead(req, rows as unknown as Array<{ space_id?: string | null }>, "organisation", "gifts");
    if (sp.get("totals") !== "1" || rows.length === 0) return NextResponse.json({ occasions: rows, today: todayLondon() });
    const { data: gifts } = await supabase.from("gifts").select("occasion_id, status, target_price, paid_amount").in("occasion_id", rows.map((r) => r.id)).limit(5000);
    const by = new Map<string, Array<Pick<GiftRow, "status" | "target_price" | "paid_amount">>>();
    for (const g of (gifts ?? []) as Array<{ occasion_id: string } & Pick<GiftRow, "status" | "target_price" | "paid_amount">>) by.set(g.occasion_id, [...(by.get(g.occasion_id) ?? []), g]);
    const withTotals = rows.map((o: OccasionRow) => ({ ...o, totals: occasionTotals(by.get(o.id) ?? [], o.budget) }));
    return NextResponse.json({ occasions: withTotals, today: todayLondon() });
  } catch (err) {
    console.error("[/api/gift-occasions GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  kind?: string;
  person_id?: string | null;
  occurs_on?: string;
  recurrence?: "none" | "annual";
  budget?: number | null;
  lead_days?: number[];
  notes?: string | null;
};

/** POST — a one-off or an annual occasion by hand (spec §5: one-offs are created by hand or from a capture). */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJson<CreateBody>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (typeof body.occurs_on !== "string" || !DATE_RE.test(body.occurs_on)) return NextResponse.json({ error: "occurs_on is a date, YYYY-MM-DD" }, { status: 400 });
  const kind = isOccasionKind(body.kind) ? body.kind : "other";
  const personId = isUuid(body.person_id) ? body.person_id : null;
  if (body.person_id && !personId) return NextResponse.json({ error: "person_id is a person id" }, { status: 400 });
  const budget = body.budget === null || body.budget === undefined ? null : typeof body.budget === "number" && Number.isFinite(body.budget) && body.budget >= 0 ? Math.round(body.budget * 100) / 100 : NaN;
  if (Number.isNaN(budget)) return NextResponse.json({ error: "budget is a number" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (personId && !(await canSeePerson(supabase, personId))) return NextResponse.json({ error: "No such person." }, { status: 400 });
    const { data, error } = await supabase
      .from("gift_occasions")
      .insert({
        name: name.slice(0, 160),
        kind,
        person_id: personId,
        occurs_on: body.occurs_on,
        recurrence: body.recurrence === "annual" ? "annual" : "none",
        source: "manual",
        budget,
        lead_days: cleanLeadDays(body.lead_days) ?? [...DEFAULT_LEAD_DAYS],
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      })
      .select(OCCASION_SELECT)
      .single();
    if (error || !data) {
      if (error?.code === "23505") return NextResponse.json({ error: "There is already an annual occasion of that kind for that person in that year." }, { status: 409 });
      throw error ?? new Error("insert returned no row");
    }
    return NextResponse.json({ occasion: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/gift-occasions POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
