import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  NotInstanceOwnerError,
  getFeatureFlags,
  isFeatureFlag,
  setFeatureFlags,
  type FeatureFlags,
} from "@/lib/system/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Instance-owner-only: read or set another user's AI-backed feature flags
 * (P12 open item A — off by default for new users, enabled per user by the
 * instance owner). Under /api/admin, so the middleware already demanded an
 * aal2 session; the helper re-checks that the caller is the instance owner.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ userId: id, flags: await getFeatureFlags(me.id, id) });
  } catch (err) {
    if (err instanceof NotInstanceOwnerError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const flags: FeatureFlags = {};
  for (const [k, v] of Object.entries(body)) {
    if (isFeatureFlag(k) && typeof v === "boolean") flags[k] = v;
  }
  if (Object.keys(flags).length === 0) {
    return NextResponse.json({ error: "No known feature flags in body" }, { status: 400 });
  }

  try {
    const applied = await setFeatureFlags(me.id, id, flags);
    return NextResponse.json({ userId: id, flags: applied });
  } catch (err) {
    if (err instanceof NotInstanceOwnerError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}
