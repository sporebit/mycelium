"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { reportApiError } from "@/lib/data/apiWrite";
import { Mono } from "@/components/dashboard/Mono";
import { Money } from "@/components/finance/Money";
import type { PersonBalance } from "@/lib/types/receipt";

const BALANCES_KEY = "/api/receipts/balances";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * What everyone owes across every receipt, and what they have paid back.
 *
 * Owed is derived from the shares on each line, so it moves when a line is
 * corrected — there is no stored total here to fall out of step with the
 * receipts themselves.
 */
export function BalancesClient() {
  const { data, isLoading, mutate } = useApi<{ balances?: PersonBalance[] }>(
    BALANCES_KEY,
  );

  const balances = useMemo<PersonBalance[]>(
    () => (Array.isArray(data?.balances) ? data.balances : []),
    [data],
  );

  const totalOutstanding = useMemo(
    () => Math.round(balances.reduce((s, b) => s + b.outstanding, 0) * 100) / 100,
    [balances],
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Balances
          </h1>
          <Link
            href="/organisation/receipts"
            className="text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-3 hover:text-loam-4 transition-colors"
          >
            ← All receipts
          </Link>
        </div>
        <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)]">
          What everyone owes across every receipt, less what they have paid.
        </p>
      </header>

      {balances.length > 0 && (
        <div className="flex items-center gap-4 rounded-v2-md border border-hairline bg-surface-1 px-4 py-3">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">
            TOTAL OUTSTANDING
          </Mono>
          <span className="text-lg tabular-nums text-loam-4">
            <Money value={totalOutstanding} format="balance" />
          </span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </p>
      ) : balances.length === 0 ? (
        <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Nobody owes anything. Add people to a receipt and tag them on its lines.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {balances.map((b) => (
            <PersonCard key={b.person_id} balance={b} onChanged={() => void mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  balance,
  onChanged,
}: {
  balance: PersonBalance;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [note, setNote] = useState("");

  // A negative outstanding is an overpayment — money owed back, not a balance
  // of zero, so it is shown as what it is rather than clamped away.
  const settled = Math.abs(balance.outstanding) < 0.005;
  const overpaid = balance.outstanding < -0.005;

  async function record() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) {
      reportApiError(new Error("Enter an amount"), "Nothing to record");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/receipts/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: balance.person_id,
          amount: n,
          paid_at: paidAt,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        reportApiError(new Error(j.error ?? "Could not record that payment"));
        return;
      }
      setAmount("");
      setNote("");
      setPaidAt(today());
      setRecording(false);
      onChanged();
    } catch (e) {
      reportApiError(e, "Could not record that payment");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "bg-surface-2 border border-hairline rounded-v2-sm px-2 py-1 text-[11px] text-loam-4 outline-none focus:border-glow-dim";

  return (
    <div className="rounded-v2-lg border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-4 flex-wrap px-4 py-3">
        <span className="text-sm text-loam-4 flex-1 min-w-32">{balance.display_name}</span>

        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">OWED</Mono>
          <span className="text-sm tabular-nums text-loam-4">
            <Money value={balance.owed} format="balance" />
          </span>
        </div>
        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">PAID</Mono>
          <span className="text-sm tabular-nums text-loam-4">
            <Money value={balance.paid} format="balance" />
          </span>
        </div>
        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">
            {overpaid ? "OVERPAID" : "OUTSTANDING"}
          </Mono>
          <span
            className={`text-sm tabular-nums ${
              settled ? "text-glow" : overpaid ? "text-warn" : "text-loam-4"
            }`}
          >
            <Money
              value={overpaid ? Math.abs(balance.outstanding) : balance.outstanding}
              format="balance"
            />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="px-3 py-1.5 rounded-v2-md border border-hairline bg-surface-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-4 hover:bg-surface-3 transition-colors"
        >
          {expanded ? "Hide" : `${balance.receipts.length} receipt${balance.receipts.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={() => setRecording((v) => !v)}
          className="px-3 py-1.5 rounded-v2-md border border-hairline bg-surface-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-4 hover:bg-surface-3 transition-colors"
        >
          {recording ? "Cancel" : "Record payment"}
        </button>
      </div>

      {recording && (
        <div className="flex items-end gap-2 flex-wrap border-t border-hairline px-4 py-3 bg-surface-2/40">
          <label className="flex flex-col gap-1">
            <Mono className="text-[9px] tracking-[0.18em] text-loam-3">AMOUNT</Mono>
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={String(Math.max(0, balance.outstanding).toFixed(2))}
              className={`${field} w-24 font-[family-name:var(--font-mono)] tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Mono className="text-[9px] tracking-[0.18em] text-loam-3">DATE</Mono>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={`${field} w-36`}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-40">
            <Mono className="text-[9px] tracking-[0.18em] text-loam-3">NOTE</Mono>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bank transfer, cash…"
              className={`${field} w-full`}
            />
          </label>
          <button
            type="button"
            onClick={() => void record()}
            disabled={saving}
            className="px-3 py-1.5 rounded-v2-md border border-glow-dim/40 bg-glow-wash text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-glow hover:bg-glow-wash/70 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-hairline">
          {balance.receipts.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-loam-3 italic font-[family-name:var(--font-display)]">
              Nothing owed on any receipt — this balance is what a payment left behind.
            </p>
          ) : (
            <ul className="flex flex-col">
              {balance.receipts.map((r) => (
                <li key={r.receipt_id}>
                  <Link
                    href={`/organisation/receipts?receipt=${r.receipt_id}`}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2 border-b border-hairline last:border-b-0 transition-colors"
                  >
                    <Mono className="text-[11px] text-loam-3 w-24 shrink-0">
                      {fmtDate(r.purchased_at)}
                    </Mono>
                    <span className="flex-1 min-w-0 truncate text-[13px] text-loam-4">
                      {r.title ?? r.retailer ?? "Unknown retailer"}
                    </span>
                    <span className="text-[13px] tabular-nums text-loam-4">
                      <Money value={r.owed} format="balance" currency={r.currency} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
