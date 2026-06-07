import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { TendrilSpine } from "@/components/nav/TendrilSpine";

export default function HealthLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="HEALTH">
      <TendrilSpine />
      <div className="lg:pl-[88px]">{children}</div>
    </Shell>
  );
}
