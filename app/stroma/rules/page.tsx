import { Shell } from "@/components/dashboard/Shell";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { RulesClient } from "@/components/stroma/RulesClient";

export const dynamic = "force-dynamic";

export default function StromaRulesPage() {
  return (
    <Shell active="STROMA">
      <StromaSubNav />
      <RulesClient />
    </Shell>
  );
}
