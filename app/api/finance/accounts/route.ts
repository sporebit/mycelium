import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("id, bank, external_key, account_number, sort_code, label, account_type, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    console.error("[/api/finance/accounts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
