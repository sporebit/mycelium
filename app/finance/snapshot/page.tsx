import { Shell } from "@/components/dashboard/Shell";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";
import { FinancePageClient } from "@/components/finance/FinancePageClient";

export default function FinanceSnapshotPage() {
  return (
    <Shell active="FINANCE">
      <FinanceSubNav />
      <FinancePageClient />
    </Shell>
  );
}
