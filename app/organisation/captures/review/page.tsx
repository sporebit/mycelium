import { CaptureReviewClient } from "@/components/compost/CaptureReviewClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?tab=entities` opens the New entities tab; `&day=<day id>` narrows it to one day-log day. */
export default async function CaptureReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; day?: string | string[] }> }) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const day = Array.isArray(sp.day) ? sp.day[0] : sp.day;
  return <CaptureReviewClient initialTab={tab === "entities" || tab === "all" ? tab : "needs_review"} dayId={day && UUID_RE.test(day) ? day : null} />;
}
