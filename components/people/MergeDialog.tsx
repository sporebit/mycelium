"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonWithAliases } from "@/lib/people/types";

/**
 * Merge two people (people-contacts C3): pick the survivor, choose per
 * field, see what gets unioned (numbers, emails, aliases). One POST; the
 * database walks every link in one transaction and the loser's id keeps
 * resolving to the survivor.
 */

const FIELDS: Array<{ key: keyof PersonWithAliases & string; label: string }> = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "display_name", label: "Display name" },
  { key: "relationship", label: "Relationship" },
  { key: "birthday", label: "Birthday" },
  { key: "address", label: "Address" },
  { key: "where_we_met", label: "Where we met" },
  { key: "mutual_interests", label: "Mutual interests" },
  { key: "notes", label: "Notes" },
];

function nameOf(p: PersonWithAliases | null): string {
  if (!p) return "…";
  return p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "(unnamed)";
}

export function MergeDialog({ aId, bId, onClose, onMerged }: { aId: string; bId: string; onClose: () => void; onMerged?: (survivorId: string) => void }) {
  const router = useRouter();
  const [a, setA] = useState<PersonWithAliases | null>(null);
  const [b, setB] = useState<PersonWithAliases | null>(null);
  const [survivor, setSurvivor] = useState<"a" | "b">("a");
  const [pick, setPick] = useState<Record<string, "a" | "b">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [ra, rb] = await Promise.all([fetch(`/api/people/${aId}`, { cache: "no-store" }), fetch(`/api/people/${bId}`, { cache: "no-store" })]);
      if (!live) return;
      if (ra.ok) setA(((await ra.json()) as { person: PersonWithAliases }).person);
      if (rb.ok) setB(((await rb.json()) as { person: PersonWithAliases }).person);
    })();
    return () => {
      live = false;
    };
  }, [aId, bId]);

  const S = survivor === "a" ? a : b;
  const L = survivor === "a" ? b : a;

  const differing = useMemo(() => FIELDS.filter((f) => a && b && (a[f.key] ?? "") !== (b[f.key] ?? "") && (a[f.key] || b[f.key])), [a, b]);

  async function merge() {
    if (!S || !L || busy) return;
    setBusy(true);
    setError(null);
    const fields: Record<string, unknown> = {};
    for (const f of differing) {
      const from = (pick[f.key] ?? survivor) === "a" ? a : b;
      const v = from?.[f.key];
      // only a value that is not already the survivor's needs sending
      if ((v ?? "") !== (S[f.key] ?? "")) fields[f.key] = v ?? null;
    }
    try {
      const r = await fetch("/api/people/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survivor_id: S.id, loser_id: L.id, fields }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; survivor?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      if (onMerged) onMerged(S.id);
      else router.push(`/organisation/people/${S.id}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "merge failed");
    } finally {
      setBusy(false);
    }
  }

  const col = (who: "a" | "b") => (who === "a" ? a : b);

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Merge people" className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ink-2 bg-ink-1 p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-text-0">Merge people</h2>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-4" aria-label="Close">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((who) => {
            const p = col(who);
            const isSurvivor = survivor === who;
            return (
              <button
                key={who}
                type="button"
                onClick={() => setSurvivor(who)}
                className={`text-left rounded-md border p-3 transition-colors ${isSurvivor ? "border-glow-2/60 bg-glow-2/10" : "border-ink-2 bg-ink-0/40 hover:border-ink-3"}`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-ink-3">{isSurvivor ? "Survivor — keeps this id" : "Merged into the survivor"}</div>
                <div className="font-[family-name:var(--font-display)] text-lg text-text-0">{nameOf(p)}</div>
                <div className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)]">
                  {p?.tier === "contact" ? "contact · " : ""}
                  {(p?.phones?.length ?? 0)} numbers · {(p?.emails?.length ?? 0)} emails · {(p?.aliases?.length ?? 0)} aliases
                  {p?.mention_count ? ` · ${p.mention_count} mentions` : ""}
                  {p?.quote_count ? ` · ${p.quote_count} quotes` : ""}
                </div>
              </button>
            );
          })}
        </div>

        {differing.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="card-eyebrow">Where they differ — pick the value to keep</div>
            {differing.map((f) => (
              <div key={f.key} className="grid grid-cols-[110px_1fr_1fr] items-start gap-2 text-sm">
                <span className="text-[11px] text-ink-3 pt-1">{f.label}</span>
                {(["a", "b"] as const).map((who) => {
                  const v = col(who)?.[f.key];
                  const chosen = (pick[f.key] ?? survivor) === who;
                  return (
                    <label key={who} className={`flex items-start gap-2 rounded-sm border px-2 py-1 cursor-pointer ${chosen ? "border-glow-2/50 bg-glow-2/10" : "border-ink-2"}`}>
                      <input type="radio" name={`pick-${f.key}`} checked={chosen} onChange={() => setPick((cur) => ({ ...cur, [f.key]: who }))} className="mt-1 accent-accent" />
                      <span className={`whitespace-pre-wrap break-words ${v ? "text-text-0" : "text-ink-3 italic"}`}>{v ? String(v) : "(empty)"}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-3">
          Numbers, emails and aliases are unioned and de-duplicated. Every mention, quote, day-log scene, ticket and receipt that pointed at {nameOf(L)} will point at {nameOf(S)}. {nameOf(L)} goes to the bin and its old id keeps opening the survivor.
        </p>

        {error && <div className="text-xs text-danger">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em]">CANCEL</button>
          <button type="button" disabled={!a || !b || busy} onClick={() => void merge()} className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 text-xs font-medium font-[family-name:var(--font-mono)] tracking-[0.1em]">
            {busy ? "MERGING…" : `MERGE INTO ${nameOf(S).toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
