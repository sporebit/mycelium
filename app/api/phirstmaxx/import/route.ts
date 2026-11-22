import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { pmCtx } from "@/lib/phirstmaxx/server";
import { applyImport, callerEmail, type ImportPayload } from "@/lib/phirstmaxx/import";

export const runtime = "nodejs";
export const maxDuration = 120;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/phirstmaxx/import (spec §10) — the old app's data into pm_*,
 * as the caller, under RLS. A session or the API secret (acts as Phil;
 * scripts/phirstmaxx-import.mjs); nothing else, and no GET.
 *
 *   { payload, dryRun? }   plan (default) or write; answers per-table
 *                          { inserted, updated, unchanged, skipped[] },
 *                          how each old member was placed, the phase-2
 *                          counts left in the old database, research queued
 *   { undo: true, dryRun? } remove everything that came from the old app;
 *                          rows made here (pm_blocks.local = true, no old_id)
 *                          survive
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson<{ payload?: unknown; dryRun?: unknown; undo?: unknown; space?: unknown }>(req);
  if (!body) return bad("bad json");
  const dryRun = body.dryRun !== false;
  const undo = body.undo === true;
  if (!undo && (!body.payload || typeof body.payload !== "object" || !Array.isArray((body.payload as ImportPayload).members))) {
    return bad("Send { payload } from scripts/phirstmaxx-import.mjs, or { undo: true }.");
  }
  try {
    const supabase = await createUserClient();
    const ctx = await pmCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!ctx) return bad("No family space.", 404);
    const email = undo ? null : await callerEmail(supabase);
    const result = await applyImport(supabase, ctx, (body.payload ?? {}) as ImportPayload, { dryRun, undo, email });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/phirstmaxx/import POST]", err);
    return bad(err instanceof Error ? err.message : "import failed", 500);
  }
}
