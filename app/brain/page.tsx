import { Suspense } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { BrainClient } from "@/components/brain/BrainClient";
import { BrainSubNav } from "@/components/brain/BrainSubNav";

export default function BrainPage() {
  return (
    <Shell active="BRAIN">
      <BrainSubNav />
      <Suspense fallback={null}>
        <BrainClient />
      </Suspense>
    </Shell>
  );
}
