import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { VenturesSubNav } from "@/components/ventures/VenturesSubNav";

export default function VenturesLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="VENTURES">
      <VenturesSubNav />
      {children}
    </Shell>
  );
}
