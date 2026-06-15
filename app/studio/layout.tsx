import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { StudioSubNav } from "@/components/studio/StudioSubNav";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="STUDIO">
      <StudioSubNav />
      {children}
    </Shell>
  );
}
