import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function OrganisationLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
