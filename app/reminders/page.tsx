import { Shell } from "@/components/dashboard/Shell";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ reminder?: string }>;
}) {
  const { reminder } = await searchParams;
  return (
    <Shell>
      <RemindersClient focusId={reminder ?? null} />
    </Shell>
  );
}
