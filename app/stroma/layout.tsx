import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { TendrilSpine } from "@/components/nav/TendrilSpine";

export default function StromaLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="STROMA">
      <TendrilSpine />
      <div className="lg:pl-[52px]">{children}</div>
    </Shell>
  );
}
