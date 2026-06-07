import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { TendrilSpine } from "@/components/nav/TendrilSpine";

export default function FitnessLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="FITNESS">
      <TendrilSpine />
      <div className="lg:pl-[88px]">{children}</div>
    </Shell>
  );
}
