"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type { Venture } from "@/lib/ventures/types";

export function NotesTab({
  venture,
  onPatch,
}: {
  venture: Venture;
  onPatch: (fields: Partial<Venture>) => void;
}) {
  const [draft, setDraft] = useState(venture.brand_notes ?? "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setDraft(venture.brand_notes ?? "");
    })();
    return () => { cancelled = true; };
  }, [venture.brand_notes]);

  return (
    <div className="flex flex-col gap-3">
      <Mono className="text-[10px] text-ink-3">
        Free-form scratchpad. Auto-saves on blur.
      </Mono>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== (venture.brand_notes ?? "")) {
            onPatch({ brand_notes: draft });
          }
        }}
        rows={12}
        className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-4 py-3 outline-none focus:border-accent resize-y"
        placeholder="Notes, ideas, brain dump…"
      />
    </div>
  );
}
