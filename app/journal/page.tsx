import { Shell } from "@/components/dashboard/Shell";
import { JournalClient } from "@/components/journal/JournalClient";

export default function JournalPage() {
  return (
    <Shell active="JOURNAL">
      <JournalClient />
    </Shell>
  );
}
