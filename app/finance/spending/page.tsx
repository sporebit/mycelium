import { Shell } from "@/components/dashboard/Shell";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";
import { SpendingClient } from "@/components/finance/SpendingClient";

export default function SpendingPage() {
  return (
    <Shell active="FINANCE">
      <FinanceSubNav />
      <SpendingClient />
    </Shell>
  );
}
