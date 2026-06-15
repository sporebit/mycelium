import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="FINANCE">
      <FinanceSubNav />
      {children}
    </Shell>
  );
}
