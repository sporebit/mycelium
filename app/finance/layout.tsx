import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <Shell active="FINANCE">{children}</Shell>;
}
