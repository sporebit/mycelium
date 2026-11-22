import { NextRequest, NextResponse } from "next/server";
import { answer, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { applyPattern, copyLastWeek, defaultWeek, deleteBlock, deletePattern, isWeekStart, parseSaveInput, resizeBlock, saveBlocks, savePattern, undoLast, updateBlock, weekData } from "@/lib/phirstmaxx/week";
import { weekStartOf } from "@/lib/phirstmaxx/grid";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

/** GET /api/phirstmaxx/week?week=YYYY-MM-DD — the grid's week (any day of it will do; the Monday is used). */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const want = req.nextUrl.searchParams.get("week");
    if (want && !isWeekStart(want)) return bad("week is a date (YYYY-MM-DD).");
    const week = want ? weekStartOf(want) : defaultWeek();
    return NextResponse.json(await weekData(r.supabase, r.ctx, week));
  } catch (err) {
    console.error("[/api/phirstmaxx/week GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST { action, space? }:
 *   save { person_id?, ranges: [{start, end}], type_id, firmness, place_id?, title?, repeat_until?, overlap_policy }
 *                                  one transaction through pm_save_blocks (spec §2.6); either person's times
 *   undo                           the caller's last save, within ten minutes
 *   resize { id, starts_at, ends_at }
 *   update { id, type_id?, firmness?, place_id?, title?, starts_at?, ends_at? }
 *   delete { id }
 *   copy_last_week { week }        the caller's own blocks from the week before, trimmed around what is there
 *   save_pattern { name, week }    the caller's blocks of that week, as a pattern
 *   apply_pattern { id, week }
 *   delete_pattern { id }
 * Every answer carries the week again when `week` is given, so the grid redraws from one response.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  const { supabase, ctx } = r;
  try {
    const action = String(body.action ?? "");
    const week = typeof body.week === "string" ? body.week : null;
    if (week !== null && !isWeekStart(week)) return bad("week is a date (YYYY-MM-DD).");
    const withWeek = async (value: Record<string, unknown>, status = 200) => NextResponse.json(week ? { ...value, week: await weekData(supabase, ctx, weekStartOf(week)) } : value, { status });
    const reply = async <T extends Record<string, unknown>>(out: { ok: true; value: T } | { ok: false; status: number; error: string }, status = 200) => (out.ok ? withWeek(out.value, status) : bad(out.error, out.status));

    switch (action) {
      case "save": {
        const input = parseSaveInput(body, ctx);
        if (!input.ok) return bad(input.error, input.status);
        return reply(await saveBlocks(supabase, ctx, input.value), 201);
      }
      case "undo":
        return reply(await undoLast(supabase, ctx));
      case "resize":
        return reply(await resizeBlock(supabase, ctx, String(body.id ?? ""), String(body.starts_at ?? ""), String(body.ends_at ?? "")).then((o) => (o.ok ? { ok: true as const, value: { block: o.value } } : o)));
      case "update":
        return reply(await updateBlock(supabase, ctx, String(body.id ?? ""), body).then((o) => (o.ok ? { ok: true as const, value: { block: o.value } } : o)));
      case "delete":
        return reply(await deleteBlock(supabase, ctx, String(body.id ?? "")));
      case "copy_last_week":
        if (!week) return bad("week is needed.");
        return reply(await copyLastWeek(supabase, ctx, weekStartOf(week)), 201);
      case "save_pattern":
        if (!week) return bad("week is needed.");
        return reply(await savePattern(supabase, ctx, String(body.name ?? ""), weekStartOf(week)), 201);
      case "apply_pattern":
        if (!week) return bad("week is needed.");
        return reply(await applyPattern(supabase, ctx, String(body.id ?? ""), weekStartOf(week)), 201);
      case "delete_pattern":
        return answer(await deletePattern(supabase, ctx, String(body.id ?? "")));
      default:
        return bad("action is save, undo, resize, update, delete, copy_last_week, save_pattern, apply_pattern or delete_pattern.");
    }
  } catch (err) {
    console.error("[/api/phirstmaxx/week POST]", err);
    return bad("failed", 500);
  }
}
