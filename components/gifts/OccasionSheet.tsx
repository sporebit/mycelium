"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Mono } from "@/components/dashboard/Mono";
import { ticketFetch } from "@/components/tickets/pickers";
import { money, type Totals } from "@/lib/gifts/money";
import { OCCASION_KIND_LABEL, OCCASION_KINDS, personName, type OccasionRow } from "@/lib/gifts/types";
import { fmtDay } from "./GiftCard";
import type { PersonOption } from "./GiftSheet";

export type OccasionWithTotals = OccasionRow & { totals?: Totals };

const input = "w-full bg-surface-2 rounded-sm text-sm text-text-hi px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-text-hi text-xs text-text-mid hover:text-text-hi hover:bg-surface-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

export function occasionFor(o: OccasionRow): string | null {
  return personName(o.person);
}

function fromOccasion(o: OccasionRow) {
  return {
    name: o.name,
    kind: o.kind,
    person_id: o.person_id ?? "",
    occurs_on: o.occurs_on,
    recurrence: o.recurrence,
    budget: o.budget === null ? "" : String(o.budget),
    lead_days: o.lead_days.join(", "),
    notes: o.notes ?? "",
  };
}

/** The budget bar: budget, committed (shortlisted + bought + given target prices) and paid (spec §7, §10). */
export function BudgetLine({ t, currency = "GBP" }: { t: Totals; currency?: string }) {
  if (t.budget === null && t.committed === 0 && t.paid === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 text-[11px] text-text-mid">
        {t.budget !== null && (
          <span>
            Budget <Mono className="text-text-hi">{money(t.budget, currency)}</Mono>
          </span>
        )}
        <span>
          Committed <Mono className="text-text-hi">{money(t.committed, currency)}</Mono>
        </span>
        <span>
          Paid <Mono className="text-text-hi">{money(t.paid, currency)}</Mono>
        </span>
        {t.left !== null && (
          <span className={t.left < 0 ? "text-warn" : ""}>
            {t.left < 0 ? "Over by" : "Left"} <Mono className={t.left < 0 ? "text-warn" : "text-text-hi"}>{money(Math.abs(t.left), currency)}</Mono>
          </span>
        )}
        {t.unpriced > 0 && <span className="text-text-lo">{t.unpriced} unpriced</span>}
      </div>
      {t.used !== null && (
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
          <div className={`h-full ${t.used > 1 ? "bg-warn" : "bg-glow-2"}`} style={{ width: `${Math.min(100, Math.round(t.used * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Detail (spec §10): the occasion's fields, its budget against what is committed, archive and delete. */
export function OccasionSheet({ occasion, people, onClose, onChanged, onDeleted }: { occasion: OccasionWithTotals | null; people: PersonOption[]; onClose: () => void; onChanged: (o: OccasionRow) => void; onDeleted: (id: string) => void }) {
  return (
    <Sheet open={!!occasion} onClose={onClose} title="Occasion">
      {occasion && <Body key={occasion.id} occasion={occasion} people={people} onClose={onClose} onChanged={onChanged} onDeleted={onDeleted} />}
    </Sheet>
  );
}

function Body({ occasion, people, onClose, onChanged, onDeleted }: { occasion: OccasionWithTotals; people: PersonOption[]; onClose: () => void; onChanged: (o: OccasionRow) => void; onDeleted: (id: string) => void }) {
  const [draft, setDraft] = useState(() => fromOccasion(occasion));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = (await fn()) as { occasion?: OccasionRow };
      if (r?.occasion) onChanged(r.occasion);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(() =>
      ticketFetch(`/api/gift-occasions/${occasion.id}`, {
        method: "PATCH",
        body: {
          name: draft.name,
          kind: draft.kind,
          person_id: draft.person_id || null,
          occurs_on: draft.occurs_on,
          recurrence: draft.recurrence,
          budget: draft.budget.trim() === "" ? null : Number(draft.budget),
          lead_days: draft.lead_days
            .split(/[\s,]+/)
            .map((s) => Number(s))
            .filter((n) => Number.isInteger(n) && n >= 0),
          notes: draft.notes || null,
        },
      }),
    );
  const del = async () => {
    if (!window.confirm("Delete this occasion? Its gifts stay, with no occasion.")) return;
    setBusy(true);
    try {
      await ticketFetch(`/api/gift-occasions/${occasion.id}`, { method: "DELETE" });
      onDeleted(occasion.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="occasion-sheet">
      <Mono className="text-[10px] text-text-lo">
        {occasion.source === "person_dob" ? "from their date of birth" : occasion.source === "fixed" ? "fixed calendar" : "by hand"} · {occasion.recurrence === "annual" ? "every year" : "one-off"}
        {occasion.archived_at ? " · archived" : ""}
      </Mono>
      {occasion.totals && <BudgetLine t={occasion.totals} />}
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Name</span>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${input} font-[family-name:var(--font-display)] text-lg`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Kind</span>
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as OccasionRow["kind"] })} className={input}>
            {OCCASION_KINDS.map((k) => (
              <option key={k} value={k}>
                {OCCASION_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Person</span>
          <select value={draft.person_id} onChange={(e) => setDraft({ ...draft, person_id: e.target.value })} className={input}>
            <option value="">— shared / nobody —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Date</span>
          <input type="date" value={draft.occurs_on} onChange={(e) => setDraft({ ...draft, occurs_on: e.target.value })} className={input} />
          {occasion.source === "person_dob" && <span className="text-[11px] text-text-lo">Follows their date of birth in People; a change there moves this.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Repeats</span>
          <select value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as "none" | "annual" })} className={input}>
            <option value="none">One-off</option>
            <option value="annual">Every year</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Budget</span>
          <input type="number" min={0} step={1} value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} placeholder="optional" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Remind, days before</span>
          <input value={draft.lead_days} onChange={(e) => setDraft({ ...draft, lead_days: e.target.value })} placeholder="30, 7" className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="card-eyebrow">Notes</span>
          <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${input} resize-y`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => void save()} disabled={busy || !draft.name.trim() || !draft.occurs_on}>
          SAVE
        </button>
        <button type="button" className={btn} onClick={() => run(() => ticketFetch(`/api/gift-occasions/${occasion.id}`, { method: "PATCH", body: { archived_at: occasion.archived_at ? null : true } }))} disabled={busy}>
          {occasion.archived_at ? "UNARCHIVE" : "ARCHIVE"}
        </button>
        <span className="flex-1" />
        <button type="button" className={`${btn} hover:border-error/60 hover:text-error`} onClick={() => void del()} disabled={busy}>
          DELETE
        </button>
      </div>
      {err && <div className="text-xs text-error">{err}</div>}
      <Mono className="text-[10px] text-text-lo">
        {fmtDay(occasion.occurs_on)}
        {occasion.reminder_task_id ? " · reminder task made" : ""}
      </Mono>
    </div>
  );
}
