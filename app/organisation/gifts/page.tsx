import { Suspense } from "react";
import { GiftsClient } from "@/components/gifts/GiftsClient";

export const metadata = { title: "Gifts — Mycelium" };

export default function GiftsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-6 text-sm text-text-lo italic">Loading…</div>}>
      <GiftsClient />
    </Suspense>
  );
}
