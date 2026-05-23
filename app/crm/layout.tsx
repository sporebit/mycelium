import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { SubNav } from "@/components/crm/SubNav";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="CRM">
      <SubNav />
      {children}
    </Shell>
  );
}
