import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function StromaLayout({ children }: { children: ReactNode }) {
  return <Shell active="STROMA">{children}</Shell>;
}
