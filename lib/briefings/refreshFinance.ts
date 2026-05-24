import { createServerClient } from "@/lib/supabase/server";
import { fetchFinanceSheet, FinanceNotConfiguredError } from "@/lib/finance/fetchSheet";
import { extractSnapshot } from "@/lib/finance/extractSnapshot";
import { persistSnapshot } from "@/lib/finance/persistSnapshot";

/**
 * Best-effort: refresh the finance snapshot before composing the briefing.
 * Swallows all errors — the briefing should still send even if finance is down.
 */
export async function refreshFinanceBestEffort(userId: string): Promise<void> {
  try {
    const sheets = await fetchFinanceSheet({ force: true });
    const snapshot = await extractSnapshot(sheets);
    if (!snapshot) return;
    const supabase = createServerClient();
    await persistSnapshot(supabase, userId, snapshot, "cron");
  } catch (err) {
    if (err instanceof FinanceNotConfiguredError) {
      // Expected when GOOGLE_SHEETS_FINANCE_ID isn't set — silent.
      return;
    }
    console.error("[briefing] finance refresh failed:", err);
  }
}
