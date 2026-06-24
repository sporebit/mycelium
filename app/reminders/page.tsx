import { Shell } from "@/components/dashboard/Shell";
import { SubNav } from "@/components/compost/SubNav";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ reminder?: string }>;
}) {
  const { reminder } = await searchParams;
  return (
    <Shell>
      <SubNav />
      <RemindersClient focusId={reminder ?? null} />
    </Shell>
  );
}
