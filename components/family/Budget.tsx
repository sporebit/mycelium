"use client";

/**
 * The household budget: bills, baby costs, who paid what. One line per
 * cost, added in a row at the top (Enter saves and stays there for the
 * next). Each month says what was spent on what, what each of you paid,
 * and what would even it up. This is the family's own money list; nothing
 * here comes from or goes to the finance section.
 */
import { useRef, useState } from "react";
import { Label, Surface } from "@/components/ui";
import { parsePounds, pounds } from "@/lib/family/money";
import { useApi } from "@/lib/data/useApi";
import { CELL, INPUT, dayLabel, send, type CostRow, type MonthMoney, type Overview } from "./api";

type View = { costs: CostRow[]; month: string; money: MonthMoney };
const CATEGORIES = [
  { value: "bill", label: "Bill" },
  { value: "baby", label: "Baby" },
  { value: "house", label: "House" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
];
const monthLabel = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

export function Budget({ family }: { family: Overview }) {
  const [month, setMonth] = useState(family.today.slice(0, 7));
  const { data, mutate } = useApi<View>(`/api/family/costs?month=${month}`);
  const me = family.members.find((m) => m.me)?.id ?? "";
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("bill");
  const [paidBy, setPaidBy] = useState(me);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const name = (id: string | null) => family.members.find((m) => m.id === id)?.name ?? "Nobody yet";

  const add = async () => {
    setError(null);
    try {
      if (!title.trim()) throw new Error("Say what it was for.");
      const pence = parsePounds(amount);
      if (pence === null) throw new Error("The amount is a number, like 42.50.");
      // a cost added while looking at another month lands in that month
      const paid_on = month === family.today.slice(0, 7) ? family.today : `${month}-01`;
      await send("POST", "/api/family/costs", { title, amount_pence: pence, category, paid_by: paidBy || null, paid_on });
      setTitle("");
      setAmount("");
      await mutate();
      first.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    }
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void add();
    }
  };
  const money = data?.money;

  return (
    <div className="flex flex-col gap-4" data-testid="family-budget">
      <div className="flex items-center gap-3">
        <button type="button" className="px-2 text-text-lo hover:text-text-hi" aria-label="The month before" onClick={() => setMonth(shift(month, -1))}>
          ←
        </button>
        <h2 className="text-base text-text-hi">{monthLabel(month)}</h2>
        <button type="button" className="px-2 text-text-lo hover:text-text-hi disabled:opacity-30" aria-label="The month after" disabled={month >= family.today.slice(0, 7)} onClick={() => setMonth(shift(month, 1))}>
          →
        </button>
      </div>

      <Surface className="flex flex-col gap-2 p-4">
        <p className="text-2xl text-text-hi" data-testid="budget-total">{pounds(money?.total_pence ?? 0)}</p>
        <p className="text-xs text-text-mid">
          {Object.entries(money?.by_category ?? {})
            .map(([k, v]) => `${CATEGORIES.find((c) => c.value === k)?.label ?? k} ${pounds(v)}`)
            .join(" · ") || "Nothing recorded for this month."}
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-mid" aria-label="Who paid what">
          {(money?.shares ?? [])
            .filter((s) => s.person !== null || s.paid_pence > 0)
            .map((s) => (
              <li key={s.person ?? "none"}>
                <span className="text-text-hi">{name(s.person)}</span> paid {pounds(s.paid_pence)}
              </li>
            ))}
        </ul>
        {money?.even_up ? (
          <p className="text-sm text-text-mid" data-testid="budget-even-up">
            {pounds(money.even_up.pence)} from {name(money.even_up.from)} to {name(money.even_up.to)} would make it even.
          </p>
        ) : null}
      </Surface>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_7rem_9rem]">
        <input ref={first} className={`${INPUT} col-span-2 sm:col-span-1`} aria-label="What it was for" placeholder="What it was for" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter} />
        <input className={`${INPUT} text-right`} aria-label="Amount" inputMode="decimal" placeholder="£" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={onEnter} />
        <select className={`${INPUT} pr-8`} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={`${INPUT} pr-8`} aria-label="Who paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {family.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.me ? "I paid" : `${m.name} paid`}
            </option>
          ))}
          <option value="">Not paid yet</option>
        </select>
      </div>
      <p className="text-xs text-text-lo">Enter adds the line and stays here for the next.</p>
      {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}

      <div>
        <Label>This month</Label>
        <table className="mt-1 w-full border-collapse text-sm">
          <tbody className="divide-y divide-hairline">
            {(data?.costs ?? []).map((c) => (
              <tr key={c.id} data-testid="cost-row">
                <td className="w-20 py-2 text-xs text-text-lo">{dayLabel(c.paid_on)}</td>
                <td>
                  <input
                    aria-label={`What ${c.title} was for`}
                    className={CELL}
                    defaultValue={c.title}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.title) void send("PATCH", `/api/family/costs/${c.id}`, { title: v }).then(() => mutate()).catch((err: Error) => setError(err.message));
                    }}
                  />
                </td>
                <td className="hidden w-24 text-xs text-text-mid sm:table-cell">{name(c.paid_by)}</td>
                <td className="w-24">
                  <input
                    aria-label={`Amount of ${c.title}`}
                    inputMode="decimal"
                    className={`${CELL} text-right`}
                    defaultValue={(c.amount_pence / 100).toFixed(2)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    onBlur={(e) => {
                      const p = parsePounds(e.target.value);
                      if (p === null) return setError("The amount is a number, like 42.50.");
                      if (p !== c.amount_pence) void send("PATCH", `/api/family/costs/${c.id}`, { amount_pence: p }).then(() => mutate()).catch((err: Error) => setError(err.message));
                    }}
                  />
                </td>
                <td className="w-8 text-right">
                  <button type="button" className="text-xs text-text-lo hover:text-text-hi" aria-label={`Remove ${c.title}`} onClick={() => void send("DELETE", `/api/family/costs/${c.id}`).then(() => mutate()).catch((err: Error) => setError(err.message))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
