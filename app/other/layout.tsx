import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { OtherSubNav } from "@/components/other/OtherSubNav";

export default function OtherLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="OTHER">
      <OtherSubNav />
      {children}
    </Shell>
  );
}
