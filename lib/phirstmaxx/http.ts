/**
 * What every /api/phirstmaxx route does first: who is asking, their user
 * client, and their PhirstMaxx context (the family space, seeded on first
 * visit). `?space=` or body.space picks the space when the caller is in
 * two, as the family routes allow. No session, no answer: nothing under
 * /api/phirstmaxx is public except the POST-only inbox, which has its own
 * route and never comes through here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { pmCtx, type PmCtx } from "./server";

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PmRequest = { ok: true; uid: string; supabase: SupabaseClient; ctx: PmCtx } | { ok: false; res: NextResponse };

export async function pmRequest(req: NextRequest, body?: Record<string, unknown> | null): Promise<PmRequest> {
  const uid = await principalUid();
  if (!uid) return { ok: false, res: bad("Unauthorized", 401) };
  const wanted = typeof body?.space === "string" ? body.space : req.nextUrl.searchParams.get("space");
  const supabase = await createUserClient();
  const ctx = await pmCtx(supabase, uid, wanted);
  if (!ctx) return { ok: false, res: bad("No family space. PhirstMaxx lives in the family team's space: set that up first, under Family.", 404) };
  return { ok: true, uid, supabase, ctx };
}

/** A lib result ({ok, value} | {ok, status, error}) as a response. */
export function answer<T>(r: { ok: true; value: T } | { ok: false; status: number; error: string }, status = 200): NextResponse {
  return r.ok ? NextResponse.json(r.value, { status }) : bad(r.error, r.status);
}

/** A Postgres error's status: RLS refusing is 403, a missing row 404, anything else the caller's fault. */
export function dbStatus(code: string | undefined): number {
  if (code === "42501") return 403;
  if (code === "PGRST116") return 404;
  if (code === "23505") return 409;
  return 400;
}

export const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
export const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
