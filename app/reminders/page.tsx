import { Shell } from "@/components/dashboard/Shell";
import { SubNav } from "@/components/compost/SubNav";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default function RemindersPage() {
  return (
    <Shell>
      <SubNav />
      <RemindersClient />
    </Shell>
  );
}
