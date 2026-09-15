import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFinanceSheet, FinanceNotConfiguredError } from "@/lib/finance/fetchSheet";
import { extractSnapshot } from "@/lib/finance/extractSnapshot";
import { persistSnapshot } from "@/lib/finance/persistSnapshot";

/**
 * Best-effort: refresh the finance snapshot before composing the briefing.
 * Swallows all errors — the briefing should still send even if finance is down.
 */
export async function refreshFinanceBestEffort(
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const sheets = await fetchFinanceSheet({ force: true });
    const snapshot = await extractSnapshot(sheets);
    if (!snapshot) return;
    await persistSnapshot(supabase, snapshot, "cron");
  } catch (err) {
    if (err instanceof FinanceNotConfiguredError) {
      // Expected when GOOGLE_SHEETS_FINANCE_ID isn't set — silent.
      return;
    }
    console.error("[briefing] finance refresh failed:", err);
  }
}
