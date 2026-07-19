import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function OtherLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
