import { Suspense } from "react";
import { SpendingClient } from "@/components/finance/SpendingClient";

export default function SpendingPage() {
  return (
    <Suspense>
      <SpendingClient />
    </Suspense>
  );
}
