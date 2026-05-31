import { Suspense } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { StromaClient } from "@/components/stroma/StromaClient";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { MushroomNetwork } from "@/components/stroma/MushroomNetwork";

export default function StromaAskPage() {
  return (
    <Shell active="STROMA">
      <MushroomNetwork />
      <div className="relative z-10">
        <StromaSubNav />
      </div>
      {/*
        Search content floats over the fruiting-body orb. The orb sits at
        viewport y = H * 0.5 in MushroomNetwork; this wrapper centres the
        search group at the same y via fixed positioning. pointer-events
        are gated so the surrounding canvas stays interactive.
      */}
      <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center px-4">
        <div className="w-full max-w-3xl pointer-events-auto">
          <Suspense fallback={null}>
            <StromaClient />
          </Suspense>
        </div>
      </div>
    </Shell>
  );
}
