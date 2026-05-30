import { notFound } from "next/navigation";
import { TodayView } from "@/components/fitness/TodayView";

export const dynamic = "force-dynamic";

/**
 * Day-pinned variant of /fitness — same TodayView, but the date is
 * driven by the URL segment instead of the user's local "now".
 *
 * Path conflict: this catches /fitness/[date], so any future child
 * route under /fitness that matches the YYYY-MM-DD shape would clash.
 * The notFound() guard below routes anything that doesn't look like a
 * date to a 404 so other /fitness routes (calendar, log, history,
 * body, programmes, etc.) keep working — those live under their own
 * named segments, not the dynamic [date] slot.
 */
export default async function FitnessDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  return <TodayView dateKey={date} />;
}
