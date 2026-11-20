import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_HEADER, PRINCIPAL_SCOPES_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { clearQuickUnlock, hasQuickUnlock, setQuickUnlock } from "@/lib/system/quickUnlock";

export const runtime = "nodejs";

/** A PIN is set by the person, in a real session; never by a token and never by the wall. */
async function sessionOnly(): Promise<NextResponse | null> {
  const h = await headers();
  if (h.get(PRINCIPAL_HEADER) !== "user" || h.has(PRINCIPAL_SCOPES_HEADER)) {
    return NextResponse.json({ error: "sign in to set a quick unlock" }, { status: 403 });
  }
  return null;
}

/** GET — whether the caller has a PIN (never the PIN). */
export async function GET() {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  return NextResponse.json({ set: await hasQuickUnlock(await createUserClient()) });
}

/** POST { pin } — set or replace it. Four to eight digits. */
export async function POST(req: NextRequest) {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin.replace(/\s+/g, "") : "";
  const made = await setQuickUnlock(await createUserClient(), pin);
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: 400 });
  return NextResponse.json({ ok: true, set: true });
}

/** DELETE — remove it; the wall no longer offers this person's view. */
export async function DELETE() {
  const blocked = await sessionOnly();
  if (blocked) return blocked;
  await clearQuickUnlock(await createUserClient());
  return NextResponse.json({ ok: true, set: false });
}
