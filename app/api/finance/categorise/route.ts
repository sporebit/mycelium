import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { categorise } from "@/lib/finance/categorise";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const supabase = await createUserClient();
    const { data: rows, error } = await supabase
      .from("transactions")
      .select("id, txn_type, description, enriched_merchant, amount")
      .is("category", null)
      .eq("category_locked", false);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ruleMatched: 0,
        aiCategorised: 0,
        errors: [],
        total: 0,
      });
    }

    const summary = await categorise(rows, dryRun);
    return NextResponse.json({ ...summary, total: rows.length });
  } catch (err) {
    console.error("[/api/finance/categorise]", err);
    return NextResponse.json({ error: "categorise failed" }, { status: 500 });
  }
}
