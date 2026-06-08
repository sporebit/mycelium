import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <Shell active="STUDIO">{children}</Shell>;
}
