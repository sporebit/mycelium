import { Suspense } from "react";
import { CapturesClient } from "@/components/compost/CapturesClient";

export default function CRMCapturesPage() {
  return (
    <Suspense fallback={null}>
      <CapturesClient />
    </Suspense>
  );
}
