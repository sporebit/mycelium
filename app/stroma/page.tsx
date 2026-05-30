import { Suspense } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { StromaClient } from "@/components/stroma/StromaClient";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { MushroomNetwork } from "@/components/stroma/MushroomNetwork";

export default function StromaPage() {
  return (
    <Shell active="STROMA">
      <MushroomNetwork />
      <div className="relative z-10">
        <StromaSubNav />
        <Suspense fallback={null}>
          <StromaClient />
        </Suspense>
      </div>
    </Shell>
  );
}
