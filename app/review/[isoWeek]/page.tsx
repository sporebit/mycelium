import { Shell } from "@/components/dashboard/Shell";
import { ReviewClient } from "@/components/review/ReviewClient";

export default async function PastReviewPage({
  params,
}: {
  params: Promise<{ isoWeek: string }>;
}) {
  const { isoWeek } = await params;
  return (
    <Shell active="REVIEW">
      <ReviewClient initialIsoWeek={isoWeek} />
    </Shell>
  );
}
