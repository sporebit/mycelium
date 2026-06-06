import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const search = url.searchParams.get("q");
  const typeParam = url.searchParams.get("type");
  const categoryParam = url.searchParams.get("category");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const types = typeParam ? typeParam.split(",").filter(Boolean) : [];
  const cats = categoryParam ? categoryParam.split(",").filter(Boolean) : [];

  try {
    const supabase = createServerClient();

    let pageQ = supabase
      .from("transactions")
      .select("*, bank_accounts(account_number, label)", { count: "exact" })
      .eq("user_id", uid);

    if (accountId && accountId !== "all") pageQ = pageQ.eq("account_id", accountId);
    if (from) pageQ = pageQ.gte("txn_date", from);
    if (to) pageQ = pageQ.lte("txn_date", to);
    if (search) pageQ = pageQ.or(`description.ilike.%${search}%,enriched_merchant.ilike.%${search}%`);
    if (types.length > 0) pageQ = pageQ.in("txn_type", types);
    if (cats.length > 0) pageQ = pageQ.in("category", cats);

    const pageQuery = pageQ
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const aggQ = supabase.rpc("txn_agg", {
      p_user_id: uid,
      p_account_id: accountId && accountId !== "all" ? accountId : null,
      p_from: from || null,
      p_to: to || null,
      p_search: search || null,
      p_types: types.length > 0 ? types : null,
      p_categories: cats.length > 0 ? cats : null,
    });

    const [{ data, error, count }, { data: agg, error: aggErr }] =
      await Promise.all([pageQuery, aggQ]);

    if (error) throw error;
    if (aggErr) throw aggErr;

    type TxnRow = Record<string, unknown> & {
      amount: number;
      bank_accounts?: { account_number: string | null; label: string | null } | null;
    };

    const transactions = (data ?? []).map((row: TxnRow) => {
      const acct = row.bank_accounts ?? null;
      const { bank_accounts: _, ...rest } = row;
      void _;
      return {
        ...rest,
        account_number: acct?.account_number ?? null,
        account_label: acct?.label ?? null,
      };
    });

    const totalIn = Number(agg?.total_in ?? 0);
    const totalOut = Number(agg?.total_out ?? 0);

    return NextResponse.json({
      transactions,
      total: count ?? transactions.length,
      types: (agg?.types as string[]) ?? [],
      summary: {
        total_in: Math.round(totalIn * 100) / 100,
        total_out: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn + totalOut) * 100) / 100,
      },
    });
  } catch (err) {
    console.error("[/api/finance/transactions GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
