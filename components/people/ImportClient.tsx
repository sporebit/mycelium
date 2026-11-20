"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { PersonWithAliases } from "@/lib/people/types";
import type { ParsedCard } from "@/lib/people/vcard";

/**
 * /organisation/people/import (people-contacts C2): upload a .vcf, see the
 * batch summary, then the review list — each waiting card side by side with
 * the person it matched — with Merge into X / Keep separate / Skip.
 */

type Batch = { id: string; filename: string | null; card_count: number; imported: number; review: number; skipped: number; failed: number; status: string; created_at: string; pending?: number };
type Candidate = {
  id: string;
  card_index: number;
  uid: string | null;
  parsed: Omit<ParsedCard, "raw">;
  match_person_id: string | null;
  match_reason: string | null;
  match_score: number | null;
  decision: string;
  match_person: PersonWithAliases | null;
};

const btn = "px-3 py-1.5 rounded-sm border border-text-hi text-xs text-text-mid hover:text-text-hi hover:bg-surface-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

function nameOf(p: PersonWithAliases | null): string {
  if (!p) return "—";
  return p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "(unnamed)";
}

function Card({ title, lines }: { title: string; lines: Array<[string, string | null | undefined]> }) {
  return (
    <div className="rounded-md bg-surface-0/40 border border-surface-2 p-3 flex flex-col gap-1 min-w-0">
      <div className="font-[family-name:var(--font-display)] text-base text-text-hi truncate">{title}</div>
      {lines
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="text-[12px] text-text-mid truncate">
            <span className="text-text-lo font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] mr-1">{k}</span>
            {v}
          </div>
        ))}
    </div>
  );
}

export function ImportClient() {
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // SWR keys, not effects: the list and the open batch revalidate on demand.
  const { data: batchData, mutate: mutateBatches } = useApi<{ batches: Batch[] }>("/api/people/import/batches");
  const batches = batchData?.batches ?? null;
  const { data: detail, mutate: mutateDetail } = useApi<{ batch: Batch; candidates: Candidate[] }>(open ? `/api/people/import/batches/${open}` : null);
  const loadBatches = () => mutateBatches();
  const loadDetail = () => mutateDetail();

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      // a large file runs in time-budgeted passes: keep sending it with the batch id until done
      let batchId: string | null = null;
      for (let pass = 0; pass < 40; pass++) {
        const fd = new FormData();
        fd.append("file", file);
        if (batchId) fd.append("batch_id", batchId);
        const r = await fetch("/api/people/import/vcf", { method: "POST", body: fd });
        const j = (await r.json().catch(() => ({}))) as { error?: string; batch_id?: string; done?: boolean; imported?: number; review?: number; card_count?: number };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        batchId = j.batch_id ?? batchId;
        setProgress(`${(j.imported ?? 0) + (j.review ?? 0)} of ${j.card_count ?? "?"} handled…`);
        await loadBatches();
        if (batchId) setOpen(batchId);
        if (j.done !== false) break;
      }
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
    } finally {
      setUploading(false);
    }
  }

  async function decide(c: Candidate, decision: "merge" | "separate" | "skip") {
    setBusy(c.id);
    try {
      const r = await fetch(`/api/people/import/candidates/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `${r.status}`);
      await loadDetail();
      await loadBatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  const pending = detail?.candidates.filter((c) => c.decision === "pending") ?? [];
  const decided = detail?.candidates.filter((c) => c.decision !== "pending") ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/organisation/people" className="text-[11px] text-text-lo hover:text-text-hi font-[family-name:var(--font-mono)] tracking-[0.18em] self-start">← PEOPLE</Link>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="card-eyebrow">People</div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-text-hi">Import contacts</h1>
        </div>
        <Link href="/organisation/people/import-setup" className="text-[11px] text-text-lo hover:text-text-hi font-[family-name:var(--font-mono)]">spreadsheet import →</Link>
      </div>

      <label className={`rounded-md border border-dashed border-text-lo bg-surface-1 p-6 text-center cursor-pointer hover:border-glow-2/60 ${uploading ? "opacity-60" : ""}`}>
        <input type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <div className="font-[family-name:var(--font-display)] text-lg text-text-hi">{uploading ? (progress ?? "Importing…") : "Drop a .vcf here or click to choose"}</div>
        <div className="text-[11px] text-text-lo mt-1">
          Cards that match someone you already have (same number, same email, or a close name) wait below for your decision. Everyone else comes in as a contact. Re-importing the same file never duplicates anyone.
        </div>
      </label>
      {error && <div className="text-xs text-danger">{error}</div>}

      <div className="rounded-md bg-surface-1 p-4">
        <div className="card-eyebrow mb-2">Batches</div>
        {batches === null ? (
          <div className="text-xs text-text-lo italic">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="text-xs text-text-lo italic">No imports yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-surface-2">
            {batches.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => setOpen(open === b.id ? null : b.id)} className={`w-full text-left py-2 flex flex-wrap items-baseline gap-x-3 ${open === b.id ? "text-glow-2" : "text-text-hi hover:text-glow-2"}`}>
                  <span className="text-sm">{b.filename ?? "(no name)"}</span>
                  <Mono className="text-[10px] text-text-lo">{new Date(b.created_at).toLocaleString("en-GB")}</Mono>
                  <Mono className="text-[10px] text-text-lo ml-auto">
                    {b.card_count} cards · {b.imported} imported · {b.review} to review{b.pending ? ` (${b.pending} waiting)` : ""} · {b.skipped} skipped · {b.failed} failed
                  </Mono>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail && (
        <div className="flex flex-col gap-3">
          <div className="card-eyebrow">Review — {pending.length} waiting{decided.length ? ` · ${decided.length} decided` : ""}</div>
          {pending.length === 0 && <div className="text-xs text-text-lo italic">Nothing waiting in this batch.</div>}
          {pending.map((c) => {
            const p = c.parsed;
            const m = c.match_person;
            return (
              <div key={c.id} className="rounded-md bg-surface-1 p-4 flex flex-col gap-3">
                <div className="text-[11px] text-text-lo font-[family-name:var(--font-mono)]">
                  card #{c.card_index + 1} · matched on {c.match_reason}
                  {c.match_reason === "name" && c.match_score != null ? ` (${Math.round(c.match_score * 100)}%)` : ""}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card
                    title={`Card: ${p.fn || [p.n.given, p.n.family].filter(Boolean).join(" ")}`}
                    lines={[
                      ["numbers", p.phones.map((x) => `${x.e164 ?? x.raw} (${x.label})`).join(" · ") || null],
                      ["emails", p.emails.map((x) => `${x.value} (${x.label})`).join(" · ") || null],
                      ["birthday", p.birthday],
                      ["address", p.address],
                      ["org", p.org],
                    ]}
                  />
                  <Card
                    title={`Existing: ${nameOf(m)}`}
                    lines={[
                      ["tier", m?.tier ?? null],
                      ["numbers", (m?.phones ?? []).map((x) => `${x.number_e164 ?? x.number_raw} (${x.label ?? ""})`).join(" · ") || null],
                      ["emails", (m?.emails ?? []).map((x) => `${x.email} (${x.label ?? ""})`).join(" · ") || null],
                      ["birthday", m?.birthday],
                      ["address", m?.address],
                      ["relationship", m?.relationship],
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy === c.id || !m} onClick={() => void decide(c, "merge")} className="px-3 py-1.5 rounded-sm bg-glow-2 text-text-hi hover:bg-glow-1 disabled:opacity-40 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]">
                    MERGE INTO {nameOf(m).toUpperCase()}
                  </button>
                  <button type="button" disabled={busy === c.id} onClick={() => void decide(c, "separate")} className={btn}>KEEP SEPARATE</button>
                  <button type="button" disabled={busy === c.id} onClick={() => void decide(c, "skip")} className={btn}>SKIP</button>
                  {m && (
                    <Link href={`/organisation/people/${m.id}`} className="ml-auto text-[11px] text-text-lo hover:text-text-hi font-[family-name:var(--font-mono)]">open {nameOf(m)} →</Link>
                  )}
                </div>
              </div>
            );
          })}
          {decided.length > 0 && (
            <details className="text-xs text-text-lo">
              <summary className="cursor-pointer">Decided ({decided.length})</summary>
              <ul className="mt-2 flex flex-col gap-1 font-[family-name:var(--font-mono)]">
                {decided.map((c) => (
                  <li key={c.id}>
                    #{c.card_index + 1} {c.parsed.fn} — {c.decision}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
