import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

export default function WorkoutNowLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
