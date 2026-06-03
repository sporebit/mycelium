import { Shell } from "@/components/dashboard/Shell";
import { Mono } from "@/components/dashboard/Mono";

export default function OfflinePage() {
  return (
    <Shell active="MORE">
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Mono className="text-lg text-ink-3">Offline</Mono>
        <p className="text-sm text-ink-3 text-center max-w-xs">
          You&rsquo;re not connected to the internet. Previously viewed pages
          are still available &mdash; use the back button to return.
        </p>
      </div>
    </Shell>
  );
}
