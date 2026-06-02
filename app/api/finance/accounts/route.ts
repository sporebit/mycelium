import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("id, bank, account_number, sort_code, label, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    console.error("[/api/finance/accounts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
