import { NextRequest, NextResponse } from "next/server";
import { londonClock } from "@/lib/daylog/day";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { budgetView, setBudget } from "@/lib/finance/billsServer";
import { isValidCategory } from "@/lib/finance/taxonomy";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** GET /api/finance/budget?month=YYYY-MM — each category's budget against what has been spent, and where the month is heading. */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const asked = req.nextUrl.searchParams.get("month");
  if (asked && !MONTH_RE.test(asked)) return bad("month is YYYY-MM.");
  try {
    return NextResponse.json(await budgetView(await createUserClient(), asked ?? londonClock().date.slice(0, 7)));
  } catch (err) {
    console.error("[/api/finance/budget GET]", err);
    return bad("fetch failed", 500);
  }
}

/** PUT { category, monthly_pence: number | null } — set a category's monthly budget, or remove it. */
export async function PUT(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const category = typeof body.category === "string" ? body.category : "";
  if (!isValidCategory(category) || category === "Income" || category === "Transfer (internal)") return bad("That is not a spending category.");
  const pence = body.monthly_pence;
  if (pence !== null && !(typeof pence === "number" && Number.isInteger(pence) && pence >= 0 && pence <= 100_000_000)) return bad("The budget is an amount.");
  try {
    await setBudget(await createUserClient(), category, pence === 0 ? null : (pence as number | null));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/budget PUT]", err);
    return bad("That did not save.", 500);
  }
}
