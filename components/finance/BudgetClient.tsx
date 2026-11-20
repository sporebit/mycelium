"use client";

/**
 * Budget against actual (master run §10). One row a category: what the
 * month is meant to cost, what has gone, what is left, and where it is
 * heading at the rate so far. The budget cell is edited where it sits:
 * type, Enter moves down. Empty or zero removes the budget.
 *
 * Amounts are hidden by default like everywhere else in finance; a budget
 * is edited only while amounts are shown, so a figure is never in the page
 * while hidden.
 */
import { useState, type KeyboardEvent } from "react";
import { Label, Surface } from "@/components/ui";
import { Money } from "@/components/finance/Money";
import type { BudgetView } from "@/lib/finance/billsServer";
import type { BudgetLine } from "@/lib/finance/budget";
import { usePrivacy } from "@/lib/context/PrivacyContext";
import { useApi } from "@/lib/data/useApi";

const monthLabel = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const pounds = (pence: number) => pence / 100;
const STATE: Record<BudgetLine["state"], { label: string; cls: string }> = {
  over: { label: "Over", cls: "text-v2-error" },
  heading_over: { label: "Heading over", cls: "text-warn" },
  fine: { label: "", cls: "" },
  none: { label: "No budget", cls: "text-text-lo" },
};

function parse(v: string): number | null | "bad" {
  const s = v.replace(/[£,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "bad";
  return Math.round(Number(s) * 100);
}

export function BudgetClient({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const { data, error, mutate } = useApi<BudgetView>(`/api/finance/budget?month=${month}`, { revalidateOnFocus: false });
  const { financeHidden } = usePrivacy();
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (category: string, text: string, was: number) => {
    const pence = parse(text);
    if (pence === "bad") return setSaveError("A budget is an amount, like 400.");
    if ((pence ?? 0) === was) return;
    setSaveError(null);
    try {
      const res = await fetch("/api/finance/budget", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, monthly_pence: pence }) });
      if (!res.ok) throw new Error();
      await mutate();
    } catch {
      setSaveError("That did not save. Try again.");
    }
  };
  // Enter moves to the budget cell below, as in a spreadsheet.
  const down = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cells = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-budget-cell]"));
    const next = cells[cells.indexOf(e.currentTarget) + 1];
    e.currentTarget.blur();
    next?.focus();
  };

  if (error) return <p className="p-6 text-sm text-text-mid">The budget could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="p-6 text-sm text-text-lo">Loading…</p>;

  // every category has a row, so a budget can be set before anything is spent
  const have = new Set(data.lines.map((l) => l.category));
  const lines: BudgetLine[] = [...data.lines, ...data.categories.filter((c) => !have.has(c)).map((category) => ({ category, budget_pence: 0, spent_pence: 0, left_pence: 0, used: null, projected_pence: 0, state: "none" as const }))];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6" data-testid="finance-budget">
      <div className="flex items-center gap-3">
        <button type="button" className="px-2 text-text-lo hover:text-text-hi" aria-label="The month before" onClick={() => setMonth(shift(month, -1))}>
          ←
        </button>
        <h1 className="text-lg font-semibold text-text-hi">Budget, {monthLabel(month)}</h1>
        <button type="button" className="px-2 text-text-lo hover:text-text-hi disabled:opacity-30" aria-label="The month after" disabled={month >= initialMonth} onClick={() => setMonth(shift(month, 1))}>
          →
        </button>
      </div>

      <Surface className="flex flex-col gap-1 p-5">
        <p className="text-2xl text-text-hi tabular-nums" data-testid="budget-spent">
          <Money value={pounds(data.spent_pence)} format="balance" /> <span className="text-sm text-text-mid">of</span> <Money value={pounds(data.budget_pence)} format="balance" />
        </p>
        <p className="text-xs text-text-lo" data-testid="budget-as-of">
          {data.no_data
            ? `No transactions have been imported for this month yet${data.as_of ? ` (the newest is from ${data.as_of})` : ""}. Budgets can still be set.`
            : data.day < data.days
              ? `Day ${data.day} of ${data.days}, from the transactions imported so far.`
              : "The whole month."}
          {data.unbudgeted_pence > 0 ? " Some spending has no budget set." : ""}
        </p>
      </Surface>
      {financeHidden ? <p className="text-xs text-text-lo">Amounts are hidden. Show them to set or change a budget.</p> : null}
      {saveError ? <p role="alert" className="text-sm text-v2-error">{saveError}</p> : null}

      <div role="table" aria-label="Budget by category">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-2 border-b border-hairline pb-1 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_6.5rem_7rem]">
          <Label>Category</Label>
          <Label className="text-right">Budget</Label>
          <Label className="text-right">Spent</Label>
          <Label className="hidden text-right sm:block">Left</Label>
          <Label className="hidden text-right sm:block">Heading for</Label>
        </div>
        {lines.map((l) => (
          <div key={l.category} role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 border-b border-hairline py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_6.5rem_7rem]" data-testid="budget-row">
            <div className="min-w-0">
              <span className="text-text-hi">{l.category}</span>
              {STATE[l.state].label ? <span className={`ml-2 text-[11px] uppercase tracking-[0.08em] ${STATE[l.state].cls}`}>{STATE[l.state].label}</span> : null}
              {l.used !== null ? (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${l.category}: share of the budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(l.used * 100))}>
                  <div className={`h-full ${l.state === "over" ? "bg-v2-error" : l.state === "heading_over" ? "bg-warn" : "bg-glow"}`} style={{ width: `${Math.min(100, Math.round(l.used * 100))}%` }} />
                </div>
              ) : null}
            </div>
            <div className="text-right tabular-nums">
              {financeHidden ? (
                <Money value={pounds(l.budget_pence)} format="balance" />
              ) : (
                <input
                  key={`${l.category}:${l.budget_pence}`}
                  data-budget-cell
                  aria-label={`Monthly budget for ${l.category}`}
                  inputMode="decimal"
                  placeholder="£"
                  defaultValue={l.budget_pence ? (l.budget_pence / 100).toFixed(l.budget_pence % 100 === 0 ? 0 : 2) : ""}
                  onKeyDown={down}
                  onBlur={(e) => void save(l.category, e.target.value, l.budget_pence)}
                  className="w-full min-h-[32px] rounded-v2-sm border border-transparent bg-transparent px-1 text-right text-sm text-text-hi hover:border-hairline focus:border-glow focus:bg-surface-0 focus:outline-none placeholder:text-text-lo"
                />
              )}
            </div>
            <div className="text-right tabular-nums text-text-mid">
              <Money value={pounds(l.spent_pence)} format="balance" />
            </div>
            <div className={`hidden text-right tabular-nums sm:block ${l.left_pence < 0 ? "text-v2-error" : "text-text-mid"}`}>{l.used !== null ? <Money value={pounds(l.left_pence)} format="balance" /> : null}</div>
            <div className="hidden text-right tabular-nums text-text-lo sm:block">{l.used !== null && data.day < data.days && !data.no_data ? <Money value={pounds(l.projected_pence)} format="balance" /> : null}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
