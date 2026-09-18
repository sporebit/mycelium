import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/dashboard/Shell";
import { DayClient } from "@/components/daylog/DayClient";
import { DATE_RE } from "@/lib/daylog/day";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /journal/YYYY-MM-DD — the day page. A day-row uuid (from a capture link) redirects to its date. */
export default async function JournalDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (UUID_RE.test(date)) {
    const supabase = await createUserClient();
    const { data } = await supabase.from("daylog_days").select("day").eq("id", date).maybeSingle();
    const day = (data as { day: string } | null)?.day;
    if (!day) notFound();
    redirect(`/journal/${day}`);
  }
  if (!DATE_RE.test(date)) notFound();
  return (
    <Shell active="JOURNAL">
      <DayClient date={date} />
    </Shell>
  );
}
