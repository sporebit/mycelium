import { Shell } from "@/components/dashboard/Shell";
import { WeekPage } from "@/components/phirstmaxx/WeekPage";

export const dynamic = "force-dynamic";

/** /phirstmaxx/week — the grid (claude/phirstmaxx-spec.md §4). `?week=` is any day of the week to show. */
export default async function PhirstMaxxWeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  return (
    <Shell>
      <WeekPage initialWeek={week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null} />
    </Shell>
  );
}
