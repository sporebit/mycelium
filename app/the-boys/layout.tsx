import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function TheBoysLayout({ children }: { children: ReactNode }) {
  return <Shell active="THE BOYS">{children}</Shell>;
}
