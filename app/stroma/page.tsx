import { Suspense } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { StromaClient } from "@/components/stroma/StromaClient";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";

export default function StromaPage() {
  return (
    <Shell active="STROMA">
      <StromaSubNav />
      <Suspense fallback={null}>
        <StromaClient />
      </Suspense>
    </Shell>
  );
}
