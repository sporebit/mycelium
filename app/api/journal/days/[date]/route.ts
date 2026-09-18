import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { DAY_SELECT, ensureDay, getDayById, type DayRow } from "@/lib/daylog/engine";
import { DATE_RE } from "@/lib/daylog/day";
import { getDaylogSettings } from "@/lib/daylog/settings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ date: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — the day (created as pending if missing); a uuid is accepted too so capture links resolve. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { date } = await ctx.params;
  try {
    const supabase = await createUserClient();
    let day: DayRow | null;
    if (UUID_RE.test(date)) day = await getDayById(supabase, date);
    else if (DATE_RE.test(date)) day = await ensureDay(supabase, date);
    else return NextResponse.json({ error: "bad date" }, { status: 400 });
    if (!day) return NextResponse.json({ error: "not found" }, { status: 404 });
    const settings = await getDaylogSettings(supabase);
    return NextResponse.json({ day, score_keys: settings.scores });
  } catch (err) {
    console.error("[/api/journal/days/:date GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** PATCH whitelist (spec §5): summary, scores (1–5 on the configured keys), open_thread. Never transcript / extraction. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { date } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  if ("transcript" in body || "extraction" in body) return NextResponse.json({ error: "transcript and extraction are append-only" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const day = UUID_RE.test(date) ? await getDayById(supabase, date) : DATE_RE.test(date) ? await ensureDay(supabase, date) : null;
    if (!day) return NextResponse.json({ error: "not found" }, { status: 404 });
    const update: Record<string, unknown> = {};
    if ("summary" in body) {
      if (body.summary !== null && typeof body.summary !== "string") return NextResponse.json({ error: "summary must be text" }, { status: 400 });
      update.summary = typeof body.summary === "string" ? body.summary.trim() || null : null;
      update.summary_edited_by_user = true;
    }
    if ("open_thread" in body) update.open_thread = typeof body.open_thread === "string" && body.open_thread.trim() ? body.open_thread.trim() : null;
    if ("scores" in body) {
      const s = await getDaylogSettings(supabase);
      const raw = body.scores;
      if (!raw || typeof raw !== "object") return NextResponse.json({ error: "scores must be an object" }, { status: 400 });
      const next: Record<string, number> = { ...(day.scores ?? {}) };
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!s.scores.includes(k)) return NextResponse.json({ error: `unknown score key ${k}` }, { status: 400 });
        if (v === null) {
          delete next[k];
          continue;
        }
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return NextResponse.json({ error: `${k} must be 1–5` }, { status: 400 });
        next[k] = v;
      }
      update.scores = next;
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("daylog_days").update(update).eq("id", day.id).select(DAY_SELECT).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ day: data });
  } catch (err) {
    console.error("[/api/journal/days/:date PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
