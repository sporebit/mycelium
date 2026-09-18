import { Shell } from "@/components/dashboard/Shell";
import { DayListClient } from "@/components/daylog/DayListClient";

export const metadata = { title: "Journal — Mycelium" };

export default function JournalPage() {
  return (
    <Shell active="JOURNAL">
      <DayListClient />
    </Shell>
  );
}
