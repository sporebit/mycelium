"use client";

import { Skeleton } from "@/components/ui";
import { addDays, mondayOf, weekSummary } from "@/lib/hours/calc";
import { Card } from "./kit";
import { useHoursBundle } from "./useHours";
import { WeekDaysTable, WeekSummaryStrip } from "./WeekTable";

/**
 * Daily (spec §5): this week and last week by day. The table itself lives in
 * WeekTable.tsx so History can open a week with the same view. The workbook's
 * Jira-reported and Variance columns are not ported (D2).
 */
export function DailyView() {
  const { index, today, isLoading } = useHoursBundle();
  if (isLoading || !index) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const thisMonday = mondayOf(today);
  const weeks = [weekSummary(index, thisMonday, today), weekSummary(index, addDays(thisMonday, -7), today)];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Daily</h1>
      {weeks.map((w, i) => (
        <Card key={w.monday} title={<span className="text-base">{i === 0 ? "This week" : "Last week"}</span>} aside={<WeekSummaryStrip w={w} />}>
          <WeekDaysTable w={w} index={index} today={today} />
        </Card>
      ))}
    </div>
  );
}
