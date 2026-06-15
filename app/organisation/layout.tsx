import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { SubNav } from "@/components/compost/SubNav";

export default function CompostLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="COMPOST">
      <SubNav />
      {children}
    </Shell>
  );
}
