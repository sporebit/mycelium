import { Shell } from "@/components/dashboard/Shell";
import { OperatorZone } from "@/components/dashboard/OperatorZone";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

export default function DashboardPage() {
  return (
    <Shell active="HOME">
      <OperatorZone />
      <DashboardGrid />
    </Shell>
  );
}
