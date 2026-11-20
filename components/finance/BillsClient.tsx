"use client";

/**
 * Bills and subscriptions (master run §10): what leaves the account on a
 * rhythm, found in the imported transactions. For each: how often, how
 * much, when next, and whether the price has gone up. A subscription
 * nobody has said "keep" or "cancel" to is listed first, costliest first:
 * those are the forgotten ones.
 *
 * Every amount and every merchant's name goes through the redaction
 * components: hidden by default, never in the page until revealed.
 */
import { useState } from "react";
import { Button, Label, Surface } from "@/components/ui";
import { Money, PrivateText } from "@/components/finance/Money";
import type { RecurringItem, RecurringView } from "@/lib/finance/billsServer";
import { CADENCE_LABEL, type Mark } from "@/lib/finance/recurring";
import { useApi } from "@/lib/data/useApi";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const pounds = (pence: number) => pence / 100;

function Row({ item, busy, onMark }: { item: RecurringItem; busy: boolean; onMark: (mark: Mark | null) => void }) {
  const choice = (mark: Mark, label: string) => (
    <button
      type="button"
      aria-pressed={item.mark === mark}
      disabled={busy}
      onClick={() => onMark(item.mark === mark ? null : mark)}
      className={`min-h-[32px] rounded-v2-md border px-2.5 text-xs ${item.mark === mark ? "border-glow text-glow" : "border-hairline text-text-mid hover:text-text-hi"}`}
    >
      {label}
    </button>
  );
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${item.active ? "" : "opacity-60"}`} data-testid="recurring-row">
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm text-text-hi">
          <PrivateText>{item.name}</PrivateText>
          {item.rise ? <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-warn">price up</span> : null}
          {!item.active ? <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-text-lo">stopped</span> : null}
        </p>
        <p className="text-xs text-text-lo">
          {CADENCE_LABEL[item.cadence]}
          {item.fixed ? "" : ", amount varies"} · {item.count} payments since {day(item.first_on)} · {item.active ? `next around ${day(item.next_on)}` : `last ${day(item.last_on)}`}
        </p>
        {item.rise ? (
          <p className="text-xs text-text-mid">
            Was <Money value={pounds(item.rise.from_pence)} format="balance" />, now <Money value={pounds(item.rise.to_pence)} format="balance" /> since {day(item.rise.since)}.
          </p>
        ) : null}
      </div>
      <div className="w-24 text-right text-sm text-text-hi tabular-nums">
        <Money value={pounds(item.amount_pence)} format="balance" />
        {item.cadence !== "monthly" ? (
          <p className="text-[11px] text-text-lo">
            <Money value={pounds(item.monthly_pence)} format="balance" /> a month
          </p>
        ) : null}
      </div>
      <div className="flex gap-1" role="group" aria-label="What to do about it">
        {choice("keep", "Keep")}
        {choice("cancel", "Cancel it")}
        {choice("not_recurring", "Not a bill")}
      </div>
    </li>
  );
}

export function BillsClient() {
  const { data, error, mutate } = useApi<RecurringView>("/api/finance/recurring", { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mark = async (item: RecurringItem, value: Mark | null) => {
    setBusy(item.key);
    setSaveError(null);
    try {
      const res = await fetch("/api/finance/recurring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: item.key, mark: value }) });
      if (!res.ok) throw new Error();
      await mutate();
    } catch {
      setSaveError("That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="p-6 text-sm text-text-mid">Bills could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="p-6 text-sm text-text-lo">Loading…</p>;

  const live = data.items.filter((i) => i.mark !== "not_recurring");
  const unlooked = live.filter((i) => i.active && i.kind === "subscription" && !i.mark);
  const toCancel = live.filter((i) => i.mark === "cancel");
  const rest = live.filter((i) => !unlooked.includes(i) && !toCancel.includes(i));
  const dismissed = data.items.filter((i) => i.mark === "not_recurring");
  const s = data.summary;
  const stale = s.as_of ? Math.round((Date.parse(`${data.today}T00:00:00Z`) - Date.parse(`${s.as_of}T00:00:00Z`)) / 86_400_000) : null;

  const section = (title: string, items: RecurringItem[], lede?: string) =>
    items.length ? (
      <section aria-label={title}>
        <Label>{title}</Label>
        {lede ? <p className="mt-1 text-xs text-text-lo">{lede}</p> : null}
        <ul className="mt-1 flex flex-col divide-y divide-hairline">
          {items.map((i) => (
            <Row key={i.key} item={i} busy={busy === i.key} onMark={(m) => void mark(i, m)} />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6" data-testid="finance-bills">
      <h1 className="text-lg font-semibold text-text-hi">Bills and subscriptions</h1>
      <Surface className="flex flex-col gap-2 p-5">
        <p className="text-3xl text-text-hi tabular-nums" data-testid="bills-monthly">
          <Money value={pounds(s.monthly_pence)} format="balance" /> <span className="text-sm text-text-mid">a month</span>
        </p>
        <p className="text-sm text-text-mid">
          <Money value={pounds(s.yearly_pence)} format="currency" /> a year · {s.bills} {s.bills === 1 ? "bill" : "bills"} · {s.subscriptions} {s.subscriptions === 1 ? "subscription" : "subscriptions"}
          {s.rises ? ` · ${s.rises} gone up` : ""}
        </p>
        {s.as_of ? (
          <p className="text-xs text-text-lo" data-testid="bills-as-of">
            From transactions up to {day(s.as_of)}
            {stale !== null && stale > 14 ? `, ${stale} days ago. Anything since then is not here yet.` : "."}
          </p>
        ) : (
          <p className="text-xs text-text-lo">No transactions have been imported yet.</p>
        )}
      </Surface>
      {saveError ? <p role="alert" className="text-sm text-v2-error">{saveError}</p> : null}
      {data.items.length === 0 && s.as_of ? <p className="text-sm text-text-mid">Nothing recurring was found. It takes three payments at a steady interval to show here, or two for a direct debit.</p> : null}

      {section("Not looked at yet", unlooked, "Subscriptions still running that you have not said keep or cancel to, costliest first.")}
      {section("To cancel", toCancel)}
      {section("Everything else", rest)}
      {dismissed.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-text-lo">{dismissed.length} marked as not a bill</summary>
          <ul className="mt-1 flex flex-col divide-y divide-hairline">
            {dismissed.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-text-mid">
                  <PrivateText>{i.name}</PrivateText>
                </span>
                <Button size="sm" disabled={busy === i.key} onClick={() => void mark(i, null)}>
                  Put it back
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
