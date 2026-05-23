import { Suspense } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { BrainClient } from "@/components/brain/BrainClient";

export default function BrainPage() {
  return (
    <Shell active="BRAIN">
      <Suspense fallback={null}>
        <BrainClient />
      </Suspense>
    </Shell>
  );
}
