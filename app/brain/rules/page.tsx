import { Shell } from "@/components/dashboard/Shell";
import { BrainSubNav } from "@/components/brain/BrainSubNav";
import { RulesClient } from "@/components/brain/RulesClient";

export const dynamic = "force-dynamic";

export default function BrainRulesPage() {
  return (
    <Shell active="BRAIN">
      <BrainSubNav />
      <RulesClient />
    </Shell>
  );
}
