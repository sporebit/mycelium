import { Shell } from "@/components/dashboard/Shell";
import { ReviewClient } from "@/components/review/ReviewClient";

export default function ReviewPage() {
  return (
    <Shell active="REVIEW">
      <ReviewClient />
    </Shell>
  );
}
