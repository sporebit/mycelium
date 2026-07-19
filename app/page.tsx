import { Shell } from "@/components/dashboard/Shell";
import { OperatorZone } from "@/components/dashboard/OperatorZone";
import { TodayHeader } from "@/components/dashboard/today/TodayHeader";
import { NowBlock } from "@/components/dashboard/today/NowBlock";
import { TimelineRail } from "@/components/dashboard/today/TimelineRail";
import { GlanceRow } from "@/components/dashboard/today/GlanceRow";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildHeadlineContext,
  matchHeadlines,
  type HeadlineCandidate,
} from "@/lib/dashboard/headlines";

export default async function DashboardPage() {
  const uid = process.env.USER_ID;
  let candidates: HeadlineCandidate[] = [];
  if (uid) {
    try {
      const supabase = createServerClient();
      const ctx = await buildHeadlineContext(supabase, uid);
      candidates = matchHeadlines(ctx);
    } catch (err) {
      console.error("[dashboard/headlines]", err);
    }
  }

  return (
    <Shell active="HOME">
      <OperatorZone candidates={candidates} />
      <TodayHeader />
      <NowBlock />
      <TimelineRail />
      <GlanceRow />
    </Shell>
  );
}
