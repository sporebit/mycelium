"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import type { PersonWithAliases } from "@/lib/people/types";

/** Pick another person (persons and contacts) to merge with — a small search box over /api/people?tier=all. */
export function PersonPicker({ excludeId, onPick, onClose }: { excludeId: string; onPick: (id: string) => void; onClose: () => void }) {
  const { data } = useApi<{ people: PersonWithAliases[] }>("/api/people?tier=all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.people ?? [])
      .filter((p) => p.id !== excludeId)
      .filter((p) => {
        if (!words.length) return true;
        const hay = [p.display_name, p.first_name, p.last_name, ...(p.aliases ?? []).map((a) => a.alias), p.phone, p.email].filter(Boolean).join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 30);
  }, [data, q, excludeId]);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Merge with" className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-ink-2 bg-ink-1 p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-text-0">Merge with…</h2>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-4" aria-label="Close">✕</button>
        </div>
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and contacts" className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2" />
        <ul className="flex flex-col divide-y divide-ink-2">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)} className="w-full text-left py-2 hover:text-glow-2">
                <span className="text-sm text-text-0">{p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ")}</span>
                <span className="ml-2 text-[11px] text-ink-3 font-[family-name:var(--font-mono)]">
                  {p.tier === "contact" ? "contact · " : ""}
                  {p.phone ?? p.email ?? ""}
                </span>
              </button>
            </li>
          ))}
          {data && list.length === 0 && <li className="py-3 text-xs text-ink-3 italic">No one matches.</li>}
        </ul>
      </div>
    </div>
  );
}
