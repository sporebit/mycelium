import { Shell } from "@/components/dashboard/Shell";
import { FinancePageClient } from "@/components/finance/FinancePageClient";

export default function FinancePage() {
  return (
    <Shell active="FINANCE">
      <FinancePageClient />
    </Shell>
  );
}
