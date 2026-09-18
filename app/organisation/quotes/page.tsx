import { Suspense } from "react";
import { QuotesClient } from "@/components/quotes/QuotesClient";

export const metadata = { title: "Quotes — Mycelium" };

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-6 text-sm text-ink-3 italic">Loading…</div>}>
      <QuotesClient />
    </Suspense>
  );
}
