import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { HealthSubNav } from "@/components/health/HealthSubNav";

export default function HealthLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="HEALTH">
      <HealthSubNav />
      {children}
    </Shell>
  );
}
