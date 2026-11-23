"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import type { Selection } from "./useSelection";

/**
 * What appears above a grid once a row is ticked (Phil, 2026-11-23): the
 * count, Delete for the ticked rows (after one confirm), Clear, and any
 * extra action the view adds (the holding section's MERGE). Rendered as a
 * status region so a screen reader hears the count change.
 */
export function SelectionBar({ selection, onDelete, children }: { selection: Selection; onDelete: (ids: string[]) => Promise<unknown>; children?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  if (selection.count === 0) return null;
  const n = selection.count;
  const del = async () => {
    if (!window.confirm(`Delete ${n} selected ${n === 1 ? "entry" : "entries"}?`)) return;
    setBusy(true);
    await onDelete(selection.ids);
    setBusy(false);
    selection.clear();
  };
  return (
    <div role="status" data-selection-bar className="flex flex-wrap items-center gap-2 rounded-v2-md border border-glow-dim/50 bg-glow-wash px-3 py-1.5 text-xs text-text-hi">
      <span className="font-medium">
        {n} selected
      </span>
      <span className="ml-auto flex items-center gap-2">
        {children}
        <Button size="sm" variant="danger" loading={busy} onClick={() => void del()}>
          Delete selected
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={selection.clear}>
          Clear
        </Button>
      </span>
    </div>
  );
}
