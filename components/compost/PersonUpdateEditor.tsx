"use client";

import { useEffect, useMemo } from "react";
import { useApi } from "@/lib/data/useApi";

/**
 * Kind "person" on the capture review card (MYC-154): pick who the capture
 * is about and fill only the fields it gives — a birthday, a new address,
 * a number. Approving updates that person; notes are appended as a dated
 * line. Names and aliases stay with the People drawer.
 */

export type PersonUpdateDraft = {
  id: string;
  patch: { birthday?: string; address?: string; phone?: string; email?: string; relationship?: string; where_we_met?: string; mutual_interests?: string; notes?: string };
};

export const EMPTY_PERSON_UPDATE: PersonUpdateDraft = { id: "", patch: {} };

type PeopleRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null; relationship?: string | null; aliases?: Array<{ alias: string }> };

const FIELDS: Array<{ key: keyof PersonUpdateDraft["patch"]; label: string; type?: "date" | "tel" | "email"; wide?: boolean; rows?: number }> = [
  { key: "birthday", label: "Birthday", type: "date" },
  { key: "relationship", label: "Relationship" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", wide: true },
  { key: "where_we_met", label: "Where we met", wide: true },
  { key: "mutual_interests", label: "Mutual interests", wide: true },
  { key: "notes", label: "Add to notes", wide: true, rows: 2 },
];

const input = "w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";

function nameOf(p: PeopleRow): string {
  return (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)";
}

export function PersonUpdateEditor({
  value,
  onChange,
  hints,
}: {
  value: PersonUpdateDraft;
  onChange: (v: PersonUpdateDraft) => void;
  /** Names the classifier saw in the capture — used to pre-select a unique match. */
  hints: string[];
}) {
  const { data } = useApi<{ people: PeopleRow[] }>("/api/people");
  const people = useMemo(() => data?.people ?? [], [data]);

  // Pre-select when exactly one person matches a mentioned name (name or alias).
  useEffect(() => {
    if (value.id || people.length === 0 || hints.length === 0) return;
    const wanted = hints.map((h) => h.trim().toLowerCase()).filter(Boolean);
    const matches = people.filter((p) => {
      const names = [nameOf(p), p.first_name ?? "", ...(p.aliases ?? []).map((a) => a.alias)].map((s) => s.toLowerCase());
      return wanted.some((w) => names.includes(w));
    });
    if (matches.length === 1) onChange({ ...value, id: matches[0].id });
  }, [people, hints, value, onChange]);

  const set = (key: keyof PersonUpdateDraft["patch"], v: string) => {
    const patch = { ...value.patch };
    if (v.trim()) patch[key] = v;
    else delete patch[key];
    onChange({ ...value, patch });
  };

  const chosen = people.find((p) => p.id === value.id);

  return (
    <div className="rounded-md border border-glow-2/30 bg-ink-0/30 p-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Person</span>
        <select value={value.id} onChange={(e) => onChange({ ...value, id: e.target.value })} className={input}>
          <option value="">{data ? "— pick a person —" : "Loading…"}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {nameOf(p)}
              {p.relationship ? ` · ${p.relationship}` : ""}
            </option>
          ))}
        </select>
        {chosen && hints.length > 0 && (
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">from “{hints[0]}” in the capture</span>
        )}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={`flex flex-col gap-1 ${f.wide ? "sm:col-span-2" : ""}`}>
            <span className="card-eyebrow">{f.label}</span>
            {f.rows ? (
              <textarea rows={f.rows} value={value.patch[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className={`${input} resize-y`} />
            ) : (
              <input type={f.type ?? "text"} value={value.patch[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className={input} />
            )}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">Only filled fields change. Notes are added as a dated line.</p>
    </div>
  );
}
