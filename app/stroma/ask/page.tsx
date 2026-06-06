import { Suspense } from "react";
import { StromaClient } from "@/components/stroma/StromaClient";
import { MushroomNetwork } from "@/components/stroma/MushroomNetwork";

export default function StromaAskPage() {
  return (
    <>
      <MushroomNetwork />
      <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center px-4">
        <div className="w-full max-w-3xl pointer-events-auto">
          <Suspense fallback={null}>
            <StromaClient />
          </Suspense>
        </div>
      </div>
    </>
  );
}
