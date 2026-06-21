import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { DropsSubNav } from "@/components/drops/DropsSubNav";

export default function DropsLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="DROPS">
      <DropsSubNav />
      {children}
    </Shell>
  );
}
