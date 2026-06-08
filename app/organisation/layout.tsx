import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function CompostLayout({ children }: { children: ReactNode }) {
  return <Shell active="COMPOST">{children}</Shell>;
}
