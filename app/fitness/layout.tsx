import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function FitnessLayout({ children }: { children: ReactNode }) {
  return <Shell active="FITNESS">{children}</Shell>;
}
