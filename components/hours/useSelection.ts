"use client";

import { useCallback, useMemo, useState } from "react";

export type Selection = {
  /** ids ticked and still on view */
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  /** every row on view ticked */
  all: boolean;
  /** some, not all */
  some: boolean;
  /** tick every row on view, or clear */
  toggleAll: (on: boolean) => void;
  clear: () => void;
};

/**
 * Ticked rows (Phil, 2026-11-23: "a select button on each row so I can
 * delete multiple at once"). The set is keyed by entry id and read against
 * the ids currently on view, so a row that a filter hides, that merges away
 * or that is deleted drops out of the selection by itself: a bulk action
 * only ever touches rows the person can see ticked.
 */
export function useSelection(visibleIds: string[]): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const ids = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);
  const has = useCallback((id: string) => picked.has(id) && visible.has(id), [picked, visible]);
  const toggle = useCallback((id: string, on: boolean) => {
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  const toggleAll = useCallback((on: boolean) => setPicked(on ? new Set(visibleIds) : new Set()), [visibleIds]);
  const clear = useCallback(() => setPicked(new Set()), []);
  const count = ids.length;
  return { ids, count, has, toggle, all: count > 0 && count === visibleIds.length, some: count > 0 && count < visibleIds.length, toggleAll, clear };
}
