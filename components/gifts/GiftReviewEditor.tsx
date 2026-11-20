"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import type { OccasionRow } from "@/lib/gifts/types";
import { fmtDay } from "./GiftCard";

export type GiftDraft = {
  title: string;
  person: string | null;
  for_person_id: string | null;
  occasion_id: string | null;
  reason: string | null;
  url: string | null;
  target_price: number | null;
};

export type GiftDuplicateChoice = { id: string; action: "keep" } | null;

type Similar = { id: string; title: string; score: number };
type PeopleApiRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null };

const input = "w-full bg-surface-2 rounded-sm text-sm text-text-hi px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-2 py-1 rounded-sm border text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)]";

/**
 * The gift card on /organisation/captures/review (spec §4.7): the thing,
 * who it is for (resolved person or the picker — never auto-creates a
 * person), an open occasion, the reason, and the near-duplicate warning
 * with keep-existing.
 */
export function GiftReviewEditor({ value, onChange, candidates, duplicate, onDuplicate }: { value: GiftDraft; onChange: (v: GiftDraft) => void; candidates: string[]; duplicate: GiftDuplicateChoice; onDuplicate: (d: GiftDuplicateChoice) => void }) {
  const { data: peopleData } = useApi<{ people: PeopleApiRow[] }>("/api/people");
  const { data: occData } = useApi<{ occasions: OccasionRow[] }>("/api/gift-occasions");
  const people = (peopleData?.people ?? []).map((p) => ({ id: p.id, name: (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)" }));
  const occasions = occData?.occasions ?? [];
  const [similar, setSimilar] = useState<Similar[]>([]);
  const { title, for_person_id, person } = value;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (!title.trim()) {
        setSimilar([]);
        return;
      }
      const qs = new URLSearchParams({ title });
      if (for_person_id) qs.set("person", for_person_id);
      else if (person) qs.set("label", person);
      fetch(`/api/gifts/similar?${qs}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { similar: [] }))
        .then((j: { similar?: Similar[] }) => setSimilar(j.similar ?? []))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [title, for_person_id, person]);

  const unresolved = !value.for_person_id && !!value.person;

  return (
    <div className="rounded-md border border-glow-2/30 bg-surface-0/30 p-3 flex flex-col gap-3" data-testid="gift-review">
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Gift</span>
        <input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className={`${input} font-[family-name:var(--font-display)] text-base`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">For</span>
          <select value={value.for_person_id ?? ""} onChange={(e) => onChange({ ...value, for_person_id: e.target.value || null })} className={input}>
            <option value="">{value.person ? `“${value.person}” — pick a person, or keep as a name` : "— nobody yet —"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {candidates.includes(p.id) ? " (matches)" : ""}
              </option>
            ))}
          </select>
          {unresolved && <span className="text-[11px] text-warn">{candidates.length > 1 ? `“${value.person}” matches ${candidates.length} people — pick one.` : `No person called “${value.person}” — pick one, or approve with the name as written.`}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Occasion</span>
          <select value={value.occasion_id ?? ""} onChange={(e) => onChange({ ...value, occasion_id: e.target.value || null })} className={input}>
            <option value="">— none —</option>
            {occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {fmtDay(o.occurs_on)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="card-eyebrow">Why it suits them</span>
          <input value={value.reason ?? ""} onChange={(e) => onChange({ ...value, reason: e.target.value || null })} placeholder="he said…, she's always…" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Link</span>
          <input value={value.url ?? ""} onChange={(e) => onChange({ ...value, url: e.target.value || null })} placeholder="https://" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Target price</span>
          <input type="number" min={0} step={0.01} value={value.target_price ?? ""} onChange={(e) => onChange({ ...value, target_price: e.target.value === "" ? null : Number(e.target.value) })} className={input} />
        </label>
      </div>
      {similar.length > 0 && (
        <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-mid flex flex-col gap-1.5" data-testid="gift-review-dupes">
          <div className="text-warn">Near-duplicate of an idea you already have for them:</div>
          {similar.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">
                {s.title} <span className="text-text-lo">({Math.round(s.score * 100)}%)</span>
              </span>
              <button type="button" onClick={() => onDuplicate(duplicate?.id === s.id ? null : { id: s.id, action: "keep" })} className={`${btn} ${duplicate?.id === s.id ? "border-glow-2 text-glow-1" : "border-text-hi text-text-lo"}`}>
                keep existing
              </button>
            </div>
          ))}
          <div className="text-text-lo">Approve with none selected to save it as a new idea.</div>
        </div>
      )}
    </div>
  );
}
