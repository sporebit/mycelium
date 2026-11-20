import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { addHolding, isDay, listHoldings, penceFrom } from "@/lib/finance/holdingsServer";
import { isHoldingKind } from "@/lib/finance/netWorth";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** GET /api/finance/holdings — the by-hand holdings, each with its latest figure and how old it is. */
export async function GET() {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    return NextResponse.json({ holdings: await listHoldings(await createUserClient()) });
  } catch (err) {
    console.error("[/api/finance/holdings GET]", err);
    return bad("fetch failed", 500);
  }
}

/** POST { kind, name, note?, value_pounds | value_pence?, as_of? } — a new holding, with its first figure when one is given. */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  if (!isHoldingKind(body.kind)) return bad("kind is pension, property, mortgage, vehicle or other.");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return bad("A holding has a name.");
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const pence = penceFrom(body);
  if (pence === "bad") return bad("The figure is an amount.");
  const asOf = typeof body.as_of === "string" ? body.as_of : new Date().toISOString().slice(0, 10);
  if (!isDay(asOf)) return bad("as_of is a day, YYYY-MM-DD.");
  try {
    const id = await addHolding(await createUserClient(), uid, { kind: body.kind, name, note, typed_pence: pence, as_of: asOf });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[/api/finance/holdings POST]", err);
    return bad("That did not save.", 500);
  }
}
