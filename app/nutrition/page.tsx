import { Shell } from "@/components/dashboard/Shell";
import { NutritionClient } from "@/components/nutrition/NutritionClient";

export default function NutritionPage() {
  return (
    <Shell active="NUTRITION">
      <NutritionClient />
    </Shell>
  );
}
