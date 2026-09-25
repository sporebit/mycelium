"use client";

import { useState } from "react";
import type { PersonEmail, PersonPhone } from "@/lib/people/types";

/**
 * Numbers and Emails on the person page (people-contacts C5): inline label
 * edit, current / old, the export toggle (marking old turns it off; it can be
 * turned back on per row), add, remove, reorder. Every change is one PATCH.
 */

type Kind = "phones" | "emails";
type Row = PersonPhone | PersonEmail;

const input = "bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-2 py-1 outline outline-1 outline-transparent focus:outline-glow-2";
const tiny = "text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase";

function valueOf(kind: Kind, r: Row): string {
  return kind === "phones" ? ((r as PersonPhone).number_e164 ?? (r as PersonPhone).number_raw) : (r as PersonEmail).email;
}

export function ContactPointsEditor({ personId, kind, rows, onChanged }: { personId: string; kind: Kind; rows: Row[]; onChanged: () => void }) {
  const [draft, setDraft] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/people/${personId}/${kind}`;

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    try {
      const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  const add = async () => {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy("add");
    await call(base, "POST", kind === "phones" ? { number_raw: v, label: draftLabel.trim() || null } : { email: v, label: draftLabel.trim() || null });
    setDraft("");
    setDraftLabel("");
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    await call(`${base}/${id}`, "PATCH", body);
  };
  const remove = async (id: string) => {
    if (!window.confirm(`Remove this ${kind === "phones" ? "number" : "email"}?`)) return;
    setBusy(id);
    await call(`${base}/${id}`, "DELETE");
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i];
    const b = rows[j];
    setBusy(a.id);
    await call(`${base}/${a.id}`, "PATCH", { sort_order: j });
    await call(`${base}/${b.id}`, "PATCH", { sort_order: i });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="card-eyebrow">{kind === "phones" ? "Numbers" : "Emails"}</div>
      {rows.length === 0 && <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">None yet.</div>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-sm px-2 py-1.5 ${r.is_current ? "bg-ink-2/40" : "bg-ink-0/30 opacity-80"}`}>
            <span className={`text-sm font-[family-name:var(--font-mono)] ${r.is_current ? "text-text-0" : "text-ink-3 line-through"}`} title={kind === "phones" ? (r as PersonPhone).number_raw : undefined}>
              {valueOf(kind, r)}
            </span>
            <input
              type="text"
              defaultValue={r.label ?? ""}
              placeholder="label"
              aria-label="Label"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (r.label ?? "")) void patch(r.id, { label: v || null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={`${input} w-28 text-xs`}
            />
            <button type="button" disabled={busy === r.id} onClick={() => void patch(r.id, { is_current: !r.is_current })} className={`${tiny} rounded-sm border px-1.5 py-0.5 ${r.is_current ? "border-ok/40 text-ok" : "border-ink-3 text-ink-3"}`} title={r.is_current ? "Mark as old" : "Mark as current"}>
              {r.is_current ? "current" : "old"}
            </button>
            <label className={`${tiny} flex items-center gap-1 text-ink-3 cursor-pointer`} title="Include in the .vcf export">
              <input type="checkbox" checked={r.include_in_export} disabled={busy === r.id} onChange={(e) => void patch(r.id, { include_in_export: e.target.checked })} className="accent-accent h-3 w-3" />
              export
            </label>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" disabled={i === 0 || !!busy} onClick={() => void move(i, -1)} className="text-ink-3 hover:text-ink-4 disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" disabled={i === rows.length - 1 || !!busy} onClick={() => void move(i, 1)} className="text-ink-3 hover:text-ink-4 disabled:opacity-30" aria-label="Move down">↓</button>
              <button type="button" disabled={busy === r.id} onClick={() => void remove(r.id)} className="text-ink-3 hover:text-danger" aria-label="Remove">×</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type={kind === "phones" ? "tel" : "email"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={kind === "phones" ? "+ add a number" : "+ add an email"}
          className={`${input} flex-1 min-w-0`}
        />
        <input type="text" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="label" className={`${input} w-24 text-xs`} />
        <button type="button" disabled={!draft.trim() || busy === "add"} onClick={() => void add()} className={`${tiny} rounded-sm border border-ink-4 px-2 py-1 text-text-1 hover:text-text-0 hover:bg-ink-2 disabled:opacity-40`}>
          add
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
