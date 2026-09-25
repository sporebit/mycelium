"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";
import type { LinkedCount } from "@/lib/people/contacts";

/**
 * Delete (people-contacts C4): the confirm lists what points at this person
 * and offers Merge instead. Delete is soft — the bin keeps them 30 days.
 */
const TABLE_LABEL: Record<string, string> = {
  people_mentions: "mentions",
  quotes: "quotes",
  daylog_scene_people: "day-log scenes",
  daylog_facts: "day-log facts",
  tickets: "tasks waiting on them",
  receipt_participants: "receipts",
  receipt_line_shares: "receipt lines",
  receipt_settlements: "settlements",
};

export function DeleteDialog({ personId, name, onClose, onDeleted, onMergeInstead }: { personId: string; name: string; onClose: () => void; onDeleted: () => void; onMergeInstead: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError } = useApi<{ links: LinkedCount[] }>(`/api/people/${personId}/links`);
  const links: LinkedCount[] | null = loadError ? [] : (data?.links ?? null);

  async function del() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/people/${personId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `${r.status}`);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setBusy(false);
    }
  }

  const total = (links ?? []).reduce((s, l) => s + l.count, 0);

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Delete person" className="relative w-full max-w-md rounded-2xl border border-ink-2 bg-ink-1 p-5 shadow-2xl flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-text-0">Delete {name}?</h2>
        {links === null ? (
          <p className="text-sm text-ink-3">Checking what points at them…</p>
        ) : total === 0 ? (
          <p className="text-sm text-text-1">Nothing links to them. They go to the bin and are removed for good after 30 days.</p>
        ) : (
          <div className="text-sm text-text-1 flex flex-col gap-1">
            <p>Linked to them:</p>
            <ul className="text-[12px] font-[family-name:var(--font-mono)] text-ink-3 pl-3">
              {links.map((l) => (
                <li key={`${l.table}.${l.column}`}>
                  {l.count} {TABLE_LABEL[l.table] ?? l.table}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-ink-3 mt-1">Those rows keep the person id, but the person is hidden. If this is a duplicate, merge instead and the links follow the survivor.</p>
          </div>
        )}
        {error && <div className="text-xs text-danger">{error}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em]">CANCEL</button>
          <button type="button" onClick={onMergeInstead} className="px-3 py-2 rounded-sm border border-glow-2/50 text-xs text-glow-2 hover:bg-glow-2/10 font-[family-name:var(--font-mono)] tracking-[0.1em]">MERGE INSTEAD…</button>
          <button type="button" disabled={busy || links === null} onClick={() => void del()} className="px-4 py-2 rounded-sm border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-40 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]">
            {busy ? "DELETING…" : "DELETE TO BIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
