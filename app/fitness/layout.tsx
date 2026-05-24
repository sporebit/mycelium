import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { FitnessSubNav } from "@/components/fitness/FitnessSubNav";

export default function FitnessLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="FITNESS">
      <FitnessSubNav />
      {children}
    </Shell>
  );
}
