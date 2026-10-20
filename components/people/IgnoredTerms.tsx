"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { IgnoredTerm } from "@/lib/people/ignored";

const SOURCE_LABEL: Record<IgnoredTerm["source"], string> = {
  reject: "rejected person",
  pending: "not a person (review)",
  manual: "added here",
};

/** Settings → People → Ignored words (people-review R4): the list, remove, manual add. */
export function IgnoredTerms() {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, mutate } = useApi<{ terms: IgnoredTerm[] }>("/api/people/ignored");
  const rows: IgnoredTerm[] | null = loadError ? [] : (data?.terms ?? null);

  async function add() {
    const terms = draft.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) return;
    setBusy("add");
    setError(null);
    try {
      const r = await fetch("/api/people/ignored", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      setDraft("");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "add failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/people/ignored?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "remove failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-mid">
        Words that are never people. Rejecting a person or a review suggestion adds their words here; captures, tickets and the classifier skip them. The match is exact and case-insensitive — ignoring &ldquo;Smoke&rdquo; leaves &ldquo;Smokey&rdquo; alone.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a word or phrase — commas for several"
          aria-label="Ignore a word"
          className="flex-1 min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors"
        />
        <button type="submit" disabled={busy === "add" || !draft.trim()} className="px-3 py-2 rounded-sm border border-hairline text-[11px] text-text-mid hover:text-text-hi hover:bg-surface-2 disabled:opacity-50 font-[family-name:var(--font-mono)] tracking-[0.1em]">
          {busy === "add" ? "…" : "IGNORE"}
        </button>
      </form>
      {rows === null ? (
        <div className="text-xs text-ink-3 italic">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-ink-3 italic">Nothing ignored yet.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline max-h-96 overflow-y-auto">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="text-sm text-text-hi">{t.term_raw}</span>
              <Mono className="text-[10px] text-ink-3">
                {SOURCE_LABEL[t.source]} · {new Date(t.created_at).toLocaleDateString("en-GB")}
                {t.person_id && (
                  <>
                    {" · "}
                    <Link href="/other/settings/people" className="hover:underline" title="The rejected person is in the bin above; restoring them takes these words off the list">
                      in the bin
                    </Link>
                  </>
                )}
              </Mono>
              <span className="ml-auto">
                <button type="button" disabled={busy === t.id} onClick={() => void remove(t.id)} className="px-3 py-1 rounded-sm border border-hairline text-[11px] text-text-mid hover:text-text-hi hover:bg-surface-2 disabled:opacity-50 font-[family-name:var(--font-mono)] tracking-[0.1em]">
                  {busy === t.id ? "…" : "REMOVE"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="text-xs text-v2-error">{error}</div>}
    </div>
  );
}
