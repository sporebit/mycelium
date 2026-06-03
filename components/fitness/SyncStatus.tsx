"use client";

import { useSync } from "@/lib/offline/use-sync";

export function SyncStatus() {
  const { state, pending } = useSync();

  if (state === "synced") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] uppercase text-ok/70">
        <span className="w-1.5 h-1.5 rounded-full bg-ok" />
        Synced
      </span>
    );
  }

  if (state === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] uppercase text-warn">
        <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
        Offline
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] uppercase text-accent">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      Pending {pending}
    </span>
  );
}
