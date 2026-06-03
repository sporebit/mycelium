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
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);
  const offset = Number(url.searchParams.get("offset")) || 0;

  try {
    const supabase = createServerClient();

    let pageQ = supabase
      .from("transactions")
      .select("*, bank_accounts(account_number, label)", { count: "exact" })
      .eq("user_id", uid);
    let sumQ = supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", uid);

    if (accountId && accountId !== "all") {
      pageQ = pageQ.eq("account_id", accountId);
      sumQ = sumQ.eq("account_id", accountId);
    }
    if (from) {
      pageQ = pageQ.gte("txn_date", from);
      sumQ = sumQ.gte("txn_date", from);
    }
    if (to) {
      pageQ = pageQ.lte("txn_date", to);
      sumQ = sumQ.lte("txn_date", to);
    }
    if (search) {
      pageQ = pageQ.or(`description.ilike.%${search}%,enriched_merchant.ilike.%${search}%`);
      sumQ = sumQ.or(`description.ilike.%${search}%,enriched_merchant.ilike.%${search}%`);
    }

    const pageQuery = pageQ
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const [{ data, error, count }, { data: allAmounts, error: sumErr }] =
      await Promise.all([pageQuery, sumQ]);

    if (error) throw error;
    if (sumErr) throw sumErr;

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

    let totalIn = 0;
    let totalOut = 0;
    for (const row of (allAmounts ?? []) as { amount: number }[]) {
      const amt = Number(row.amount);
      if (amt > 0) totalIn += amt;
      else totalOut += amt;
    }

    return NextResponse.json({
      transactions,
      total: count ?? transactions.length,
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
