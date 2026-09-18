"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/data/useApi";

export type QuoteDraft = {
  text: string;
  speaker: string | null;
  said_by_person_id: string | null;
  is_own: boolean;
  speaker_confidence: "certain" | "uncertain";
  context: string | null;
  said_at_relative: string | null;
  source: string | null;
};

export type DuplicateChoice = { id: string; action: "keep" | "replace" } | null;

type Similar = { id: string; text: string; score: number };
type PeopleApiRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null };

const input = "w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-2 py-1 rounded-sm border text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)]";

/**
 * The quote card on /organisation/captures/review (spec §4 step 7): text,
 * speaker (resolved person or the picker — never auto-creates a person),
 * context, when it was said, the uncertain marker, and the near-duplicate
 * warning with keep / replace.
 */
export function QuoteReviewEditor({
  value,
  onChange,
  candidates,
  duplicate,
  onDuplicate,
}: {
  value: QuoteDraft;
  onChange: (v: QuoteDraft) => void;
  candidates: string[];
  duplicate: DuplicateChoice;
  onDuplicate: (d: DuplicateChoice) => void;
}) {
  const { data: peopleData } = useApi<{ people: PeopleApiRow[] }>("/api/people");
  const people = (peopleData?.people ?? []).map((p) => ({
    id: p.id,
    name: (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)",
  }));
  const [similar, setSimilar] = useState<Similar[]>([]);
  const text = value.text;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (!text.trim()) {
        setSimilar([]);
        return;
      }
      fetch(`/api/quotes/similar?text=${encodeURIComponent(text)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { similar: [] }))
        .then((j: { similar?: Similar[] }) => setSimilar(j.similar ?? []))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const who = value.is_own ? "__me" : (value.said_by_person_id ?? "");
  const unresolved = !value.is_own && !value.said_by_person_id;

  return (
    <div className="rounded-md border border-glow-2/30 bg-ink-0/30 p-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Quote</span>
        <textarea rows={2} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} className={`${input} resize-y font-[family-name:var(--font-display)] text-base`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">
            Said by
            {value.speaker_confidence === "uncertain" && <span className="ml-2 text-warn normal-case tracking-normal">uncertain</span>}
          </span>
          <select
            value={who}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...value, is_own: v === "__me", said_by_person_id: v === "__me" || v === "" ? null : v, speaker_confidence: v ? "certain" : value.speaker_confidence });
            }}
            className={input}
          >
            <option value="">{value.speaker ? `“${value.speaker}” — pick a person` : "— unknown —"}</option>
            <option value="__me">Me</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {candidates.includes(p.id) ? " (matches)" : ""}
              </option>
            ))}
          </select>
          {unresolved && value.speaker && (
            <span className="text-[11px] text-warn">
              {candidates.length > 1 ? `“${value.speaker}” matches ${candidates.length} people — pick one.` : `No person called “${value.speaker}” — pick one, or approve as unknown.`}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">When</span>
          <input value={value.said_at_relative ?? ""} onChange={(e) => onChange({ ...value, said_at_relative: e.target.value || null })} placeholder="last Tuesday, yesterday, 2026-09-01" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Context</span>
          <input value={value.context ?? ""} onChange={(e) => onChange({ ...value, context: e.target.value || null })} placeholder="at the pub, on the walk…" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Source (if quoting something)</span>
          <input value={value.source ?? ""} onChange={(e) => onChange({ ...value, source: e.target.value || null })} placeholder="film, book, person" className={input} />
        </label>
      </div>
      {similar.length > 0 && (
        <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-1 flex flex-col gap-1.5">
          <div className="text-warn">Near-duplicate of a quote you already have:</div>
          {similar.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">
                “{s.text}” <span className="text-text-2">({Math.round(s.score * 100)}%)</span>
              </span>
              <button type="button" onClick={() => onDuplicate(duplicate?.id === s.id && duplicate.action === "keep" ? null : { id: s.id, action: "keep" })} className={`${btn} ${duplicate?.id === s.id && duplicate.action === "keep" ? "border-glow-2 text-glow-1" : "border-ink-4 text-text-2"}`}>
                keep existing
              </button>
              <button type="button" onClick={() => onDuplicate(duplicate?.id === s.id && duplicate.action === "replace" ? null : { id: s.id, action: "replace" })} className={`${btn} ${duplicate?.id === s.id && duplicate.action === "replace" ? "border-glow-2 text-glow-1" : "border-ink-4 text-text-2"}`}>
                replace its text
              </button>
            </div>
          ))}
          <div className="text-text-2">Approve with neither selected to save it as a new quote.</div>
        </div>
      )}
    </div>
  );
}
