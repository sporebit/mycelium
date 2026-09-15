import { Shell } from "@/components/dashboard/Shell";
import { OperatorZone } from "@/components/dashboard/OperatorZone";
import { TodayHeader } from "@/components/dashboard/today/TodayHeader";
import { DashboardSwitcher } from "@/components/dashboard/today/DashboardSwitcher";
import { createUserClient } from "@/lib/supabase/user";
import {
  buildHeadlineContext,
  matchHeadlines,
  type HeadlineCandidate,
} from "@/lib/dashboard/headlines";

export default async function DashboardPage() {
  let candidates: HeadlineCandidate[] = [];
  try {
    const supabase = await createUserClient();
    const ctx = await buildHeadlineContext(supabase);
    candidates = matchHeadlines(ctx);
  } catch (err) {
    console.error("[dashboard/headlines]", err);
  }

  return (
    <Shell active="HOME">
      <OperatorZone candidates={candidates} />
      <TodayHeader />
      <DashboardSwitcher />
    </Shell>
  );
}
