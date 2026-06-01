import { Shell } from "@/components/dashboard/Shell";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { EntityRulesClient } from "@/components/stroma/EntityRulesClient";

export default function EntityRulesPage() {
  return (
    <Shell active="STROMA">
      <StromaSubNav />
      <EntityRulesClient />
    </Shell>
  );
}
