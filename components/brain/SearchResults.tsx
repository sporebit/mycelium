"use client";

import type { SearchMatch } from "@/lib/memory/types";
import { SourceCard } from "./SourceCard";

export function SearchResults({
  loading,
  matches,
  error,
}: {
  loading: boolean;
  matches: SearchMatch[] | null;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-ink-2 bg-ink-2/20 animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (matches === null) return null;
  if (matches.length === 0) {
    return (
      <div className="mt-6 text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
        No matches found.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 mt-6">
      {matches.map((m) => (
        <SourceCard key={m.chunk.id} match={m} />
      ))}
    </div>
  );
}
