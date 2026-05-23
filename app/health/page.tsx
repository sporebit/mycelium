import { Shell } from "@/components/dashboard/Shell";
import { NutritionTable } from "@/components/health/NutritionTable";

export default function HealthPage() {
  return (
    <Shell active="HEALTH">
      <NutritionTable />
    </Shell>
  );
}
