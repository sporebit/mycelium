"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { Person } from "@/lib/people/types";

/** Settings → People → Bin (people-contacts C4): deleted people, Restore, and when they go for good. */
export function PeopleBin() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, mutate } = useApi<{ people: Person[]; purge_after_days: number }>("/api/people/bin");
  const rows: Person[] | null = loadError ? [] : (data?.people ?? null);
  const days = data?.purge_after_days ?? 30;
  const load = () => mutate();

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/people/${id}/restore`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; survivor?: string };
      if (!r.ok) throw new Error(j.survivor ? "Merged into another person — open the survivor instead" : (j.error ?? `${r.status}`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "restore failed");
    } finally {
      setBusy(null);
    }
  }

  const purgeOn = (deletedAt: string) => {
    const d = new Date(deletedAt);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-mid">Deleted people stay here for {days} days, then the nightly run removes them for good. Someone merged into another person stays merged; open the survivor instead.</p>
      {rows === null ? (
        <div className="text-xs text-ink-3 italic">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-ink-3 italic">The bin is empty.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((p) => {
            const name = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="text-sm text-text-hi">{name}</span>
                <Mono className="text-[10px] text-ink-3">
                  {p.tier === "contact" ? "contact · " : ""}
                  deleted {p.deleted_at ? new Date(p.deleted_at).toLocaleDateString("en-GB") : ""} · gone on {p.deleted_at ? purgeOn(p.deleted_at) : "—"}
                </Mono>
                <span className="ml-auto flex items-center gap-2">
                  {p.merged_into_id ? (
                    <Link href={`/organisation/people/${p.merged_into_id}`} className="text-[11px] text-glow hover:underline font-[family-name:var(--font-mono)]">merged → open survivor</Link>
                  ) : (
                    <button type="button" disabled={busy === p.id} onClick={() => void restore(p.id)} className="px-3 py-1 rounded-sm border border-hairline text-[11px] text-text-mid hover:text-text-hi hover:bg-surface-2 disabled:opacity-50 font-[family-name:var(--font-mono)] tracking-[0.1em]">
                      {busy === p.id ? "…" : "RESTORE"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <div className="text-xs text-v2-error">{error}</div>}
    </div>
  );
}
