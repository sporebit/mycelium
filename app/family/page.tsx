import { Shell } from "@/components/dashboard/Shell";
import { FamilyClient } from "@/components/family/FamilyClient";
import { isFamilyTab } from "@/lib/family/tabs";

export const dynamic = "force-dynamic";

/**
 * /family — the family space (master run §8): one timeline, name ideas,
 * prep lists, letters to the baby, the baby log, household admin and the
 * household budget, in a team's space. `?tab=` says which is open.
 */
export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <Shell>
      <FamilyClient initialTab={isFamilyTab(tab) ? tab : "timeline"} />
    </Shell>
  );
}
