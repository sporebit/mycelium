import { Shell } from "@/components/dashboard/Shell";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default function RemindersPage() {
  return (
    <Shell>
      <RemindersClient />
    </Shell>
  );
}
