"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { Money, PrivateText } from "@/components/finance/Money";
import type { Transaction, BankAccount, ImportResult } from "@/lib/types/transaction";
import { TAXONOMY, CATEGORY_COLOURS } from "@/lib/finance/taxonomy";

type Toast = { kind: "ok" | "error"; text: string } | null;

type MatchCounts = {
  matched: number;
  ambiguous: number;
  pending: number;
  standalone: number;
};

type MatchCandidate = {
  id: string;
  description: string;
  amount: number;
  txn_date: string;
  account_label: string | null;
  account_type: string;
};

type AmbiguousPayment = {
  id: string;
  merchant_name: string | null;
  amount: number;
  paypal_date: string;
  currency: string;
  funding_type: string | null;
  candidates: MatchCandidate[];
};

function fmtDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DatePreset = { label: string; from: string; to: string };

function getDatePresets(): DatePreset[] {
  const today = new Date();
  const todayIso = isoDate(today);

  const d7 = new Date(today);
  d7.setDate(d7.getDate() - 6);

  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 29);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const yearStart = new Date(today.getFullYear(), 0, 1);

  // UK tax year: 6 Apr – 5 Apr
  const thisApr6 = new Date(today.getFullYear(), 3, 6);
  const taxYearStart = today >= thisApr6
    ? thisApr6
    : new Date(today.getFullYear() - 1, 3, 6);
  const lastTaxStart = new Date(taxYearStart.getFullYear() - 1, 3, 6);
  const lastTaxEnd = new Date(taxYearStart.getFullYear(), 3, 5);

  return [
    { label: "7 days", from: isoDate(d7), to: todayIso },
    { label: "30 days", from: isoDate(d30), to: todayIso },
    { label: "This month", from: isoDate(monthStart), to: todayIso },
    { label: "This year", from: isoDate(yearStart), to: todayIso },
    { label: "This tax year", from: isoDate(taxYearStart), to: todayIso },
    { label: "Last tax year", from: isoDate(lastTaxStart), to: isoDate(lastTaxEnd) },
    { label: "All time", from: "", to: "" },
  ];
}

// ---------------------------------------------------------------------------
// SpendingClient
// ---------------------------------------------------------------------------

export function SpendingClient() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    total_in: number;
    total_out: number;
    net: number;
  } | null>(null);

  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [categorising, setCategorising] = useState(false);
  const [matchCounts, setMatchCounts] = useState<MatchCounts | null>(null);
  const [ambiguousPayments, setAmbiguousPayments] = useState<AmbiguousPayment[]>([]);
  const [matching, setMatching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewData, setOverviewData] = useState<
    { category: string; total: number }[] | null
  >(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Fetch accounts on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((j: { accounts?: BankAccount[] }) => {
        if (cancelled) return;
        setAccounts(Array.isArray(j?.accounts) ? j.accounts : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch PayPal match state.
  const fetchMatches = useCallback(() => {
    fetch("/api/finance/paypal/matches")
      .then((r) => r.json())
      .then((j: { counts?: MatchCounts; ambiguous?: AmbiguousPayment[] }) => {
        setMatchCounts(j.counts ?? null);
        setAmbiguousPayments(j.ambiguous ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Fetch transactions whenever filters change.
  const fetchTransactions = useCallback(() => {
    const params = new URLSearchParams();
    if (accountFilter !== "all") params.set("account_id", accountFilter);
    if (search.trim()) params.set("q", search.trim());
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (typeFilter.length > 0) params.set("type", typeFilter.join(","));
    if (categoryFilter.length > 0) params.set("category", categoryFilter.join(","));

    let cancelled = false;
    fetch(`/api/finance/transactions?${params}`)
      .then((r) => r.json())
      .then(
        (j: {
          transactions?: Transaction[];
          total?: number;
          types?: string[];
          summary?: { total_in: number; total_out: number; net: number };
        }) => {
          if (cancelled) return;
          const txns = Array.isArray(j?.transactions) ? j.transactions : [];
          setTransactions(txns);
          setTotal(j?.total ?? txns.length);
          setSummary(j?.summary ?? null);
          if (j?.types) setAvailableTypes(j.types);
        },
      )
      .catch(() => setTransactions([]));
    return () => {
      cancelled = true;
    };
  }, [accountFilter, search, dateFrom, dateTo, typeFilter, categoryFilter]);

  useEffect(() => {
    return fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    let cancelled = false;
    fetch("/api/finance/analysis/by-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: dateFrom, end: dateTo }),
    })
      .then((r) => r.json())
      .then((d: { category: string; total: number }[]) => {
        if (!cancelled) setOverviewData(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setOverviewData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  // Import handler.
  async function handleImport(files: FileList | File[]) {
    if (importing) return;
    setImporting(true);
    setImportResults(null);
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    try {
      const res = await fetch("/api/finance/transactions/import", {
        method: "POST",
        body: form,
      });
      const j = (await res.json()) as { results?: ImportResult[]; error?: string };
      if (!res.ok || !j.results) {
        setToast({ kind: "error", text: j.error ?? "Import failed" });
        return;
      }
      setImportResults(j.results);
      const totalImported = j.results.reduce((s, r) => s + r.imported, 0);
      const totalSkipped = j.results.reduce((s, r) => s + r.skipped, 0);
      setToast({
        kind: "ok",
        text: `Imported ${totalImported}, skipped ${totalSkipped} dupes`,
      });
      // Re-fetch transactions, accounts, and match state.
      fetchTransactions();
      fetchMatches();
      fetch("/api/finance/accounts")
        .then((r) => r.json())
        .then((j: { accounts?: BankAccount[] }) => {
          setAccounts(Array.isArray(j?.accounts) ? j.accounts : []);
        })
        .catch(() => {});
    } catch {
      setToast({ kind: "error", text: "Import failed" });
    } finally {
      setImporting(false);
    }
  }

  // Inline category edit via the dedicated category endpoint.
  async function patchCategory(id: string, category: string) {
    const prev = transactions ?? [];
    setTransactions((cur) =>
      (cur ?? []).map((t) =>
        t.id === id
          ? {
              ...t,
              category: category || null,
              category_source: category ? "manual" : null,
              category_locked: !!category,
            }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/finance/transactions/${id}/category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) {
        setTransactions(prev);
        setToast({ kind: "error", text: "Category update failed" });
      }
    } catch {
      setTransactions(prev);
      setToast({ kind: "error", text: "Category update failed" });
    }
  }

  // Run AI + rule categorisation on uncategorised transactions.
  async function handleCategorise() {
    if (categorising) return;
    setCategorising(true);
    try {
      const res = await fetch("/api/finance/categorise", { method: "POST" });
      const j = (await res.json()) as {
        ruleMatched?: number;
        aiCategorised?: number;
        errors?: string[];
        total?: number;
      };
      if (!res.ok) {
        setToast({ kind: "error", text: "Categorisation failed" });
        return;
      }
      if ((j.total ?? 0) === 0) {
        setToast({ kind: "ok", text: "All transactions already categorised" });
        return;
      }
      setToast({
        kind: "ok",
        text: `Categorised: ${j.ruleMatched ?? 0} rules, ${j.aiCategorised ?? 0} AI`,
      });
      fetchTransactions();
    } catch {
      setToast({ kind: "error", text: "Categorisation failed" });
    } finally {
      setCategorising(false);
    }
  }

  // Re-run PayPal matcher.
  async function handleRerunMatch() {
    setMatching(true);
    try {
      const res = await fetch("/api/finance/paypal/match", { method: "POST" });
      const j = (await res.json()) as {
        ran?: { auto_matched: number; ambiguous: number };
        counts?: MatchCounts;
      };
      if (j.counts) setMatchCounts(j.counts);
      setToast({
        kind: "ok",
        text: `Matched ${j.ran?.auto_matched ?? 0}, ${j.ran?.ambiguous ?? 0} ambiguous`,
      });
      fetchMatches();
      fetchTransactions();
    } catch {
      setToast({ kind: "error", text: "Matching failed" });
    } finally {
      setMatching(false);
    }
  }

  // Resolve an ambiguous PayPal match.
  async function handleResolve(paymentId: string, transactionId: string) {
    try {
      const res = await fetch(
        `/api/finance/paypal/matches/${paymentId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction_id: transactionId }),
        },
      );
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setToast({ kind: "error", text: j.error ?? "Resolve failed" });
        return;
      }
      setToast({ kind: "ok", text: "Match resolved" });
      fetchMatches();
      fetchTransactions();
    } catch {
      setToast({ kind: "error", text: "Resolve failed" });
    }
  }

  // Sync PayPal via API.
  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/finance/paypal/sync", { method: "POST" });
      const j = (await res.json()) as {
        fetched?: number;
        imported?: number;
        matched?: number;
        error?: string;
      };
      if (!res.ok || j.error) {
        setToast({ kind: "error", text: j.error ?? "Sync failed" });
        return;
      }
      setToast({
        kind: "ok",
        text: `PayPal: ${j.fetched ?? 0} fetched, ${j.imported ?? 0} imported, ${j.matched ?? 0} matched`,
      });
      fetchTransactions();
      fetchMatches();
    } catch {
      setToast({ kind: "error", text: "PayPal sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Import section */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <ImportDropzone
            importing={importing}
            onFiles={handleImport}
          />
        </div>
        <button
          type="button"
          onClick={handleCategorise}
          disabled={categorising}
          className="shrink-0 px-4 py-3 rounded-md border border-accent/30 bg-accent/10 hover:border-accent/50 text-sm text-accent hover:text-accent/80 disabled:text-ink-3 disabled:border-ink-2 disabled:bg-ink-1/50 transition-colors font-[family-name:var(--font-mono)]"
        >
          {categorising ? "Categorising…" : "Categorise"}
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="shrink-0 px-4 py-3 rounded-md border border-ink-2 bg-ink-1/50 hover:border-ink-3 text-sm text-text-1 hover:text-text-0 disabled:text-ink-3 transition-colors font-[family-name:var(--font-mono)]"
        >
          {syncing ? "Syncing…" : "Sync PayPal"}
        </button>
      </div>

      {/* Import results */}
      {importResults && (
        <ImportResultsBanner
          results={importResults}
          onDismiss={() => setImportResults(null)}
        />
      )}

      {/* PayPal matching panel */}
      {matchCounts &&
        matchCounts.matched + matchCounts.ambiguous + matchCounts.pending > 0 && (
          <PayPalMatchPanel
            counts={matchCounts}
            ambiguous={ambiguousPayments}
            matching={matching}
            syncing={syncing}
            onRerun={handleRerunMatch}
            onSync={handleSync}
            onResolve={handleResolve}
          />
        )}

      {/* Summary strip */}
      {summary && transactions !== null && transactions.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap rounded-md bg-ink-1 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              IN
            </span>
            <Mono className="text-sm text-ok">
              <Money value={summary.total_in} format="amount" />
            </Mono>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              OUT
            </span>
            <Mono className="text-sm text-danger">
              <Money value={summary.total_out} format="amount" />
            </Mono>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              NET
            </span>
            <Mono
              className={`text-sm ${summary.net >= 0 ? "text-ok" : "text-danger"}`}
            >
              <Money value={summary.net} format="amount" />
            </Mono>
          </div>
          <div className="flex-1" />
          <Mono className="text-[11px] text-ink-3">
            {total} transaction{total === 1 ? "" : "s"}
          </Mono>
        </div>
      )}

      {/* Overview panel */}
      {overviewData && overviewData.length > 0 && (
        <div className="rounded-md bg-ink-1 border border-ink-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setOverviewOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-ink-2/20 transition-colors"
          >
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Overview
            </span>
            <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
              {overviewOpen ? "▲" : "▼"}
            </span>
          </button>
          {/* Mini stacked bar */}
          <div className="px-4 pb-2">
            <div className="flex h-2.5 rounded-full overflow-hidden">
              {(() => {
                const overviewTotal = overviewData.reduce(
                  (s, r) => s + Number(r.total),
                  0,
                );
                if (overviewTotal === 0) return null;
                return overviewData.map((row) => (
                  <div
                    key={row.category}
                    style={{
                      width: `${(Number(row.total) / overviewTotal) * 100}%`,
                      backgroundColor:
                        CATEGORY_COLOURS[row.category] ?? "var(--ink-3)",
                    }}
                    title={`${row.category}: £${Number(row.total).toFixed(2)}`}
                  />
                ));
              })()}
            </div>
          </div>
          {overviewOpen && (
            <ul className="flex flex-col divide-y divide-ink-2/60 px-4 pb-3">
              {overviewData.map((row) => {
                const overviewTotal = overviewData.reduce(
                  (s, r) => s + Number(r.total),
                  0,
                );
                return (
                  <li
                    key={row.category}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            CATEGORY_COLOURS[row.category] ?? "var(--ink-3)",
                        }}
                      />
                      <span className="text-sm text-ink-4 truncate">
                        {row.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mono className="text-[11px] text-ink-3 tabular-nums">
                        {overviewTotal > 0
                          ? `${((Number(row.total) / overviewTotal) * 100).toFixed(1)}%`
                          : "—"}
                      </Mono>
                      <Mono className="text-sm text-text-0 tabular-nums">
                        <Money value={Number(row.total)} format="balance" />
                      </Mono>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search description…"
            className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 placeholder:text-ink-3 outline-none focus:border-ink-3 transition-colors w-56"
          />
          {accounts.length > 0 && (
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 outline-none focus:border-ink-3 transition-colors"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ?? a.account_number}
                </option>
              ))}
            </select>
          )}
          {availableTypes.length > 0 && (
            <MultiSelect
              label="Type"
              options={availableTypes}
              selected={typeFilter}
              onChange={setTypeFilter}
            />
          )}
          <MultiSelect
            label="Category"
            options={[...TAXONOMY]}
            selected={categoryFilter}
            onChange={setCategoryFilter}
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setActivePreset(null);
            }}
            className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 outline-none focus:border-ink-3 transition-colors"
            placeholder="from"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setActivePreset(null);
            }}
            className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 outline-none focus:border-ink-3 transition-colors"
            placeholder="to"
          />
          {(search || dateFrom || dateTo || accountFilter !== "all" || typeFilter.length > 0 || categoryFilter.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setAccountFilter("all");
                setTypeFilter([]);
                setCategoryFilter([]);
                setActivePreset(null);
              }}
              className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
            >
              Clear
            </button>
          )}
        </div>
        {/* Date presets — horizontal scroller on mobile */}
        <div className="relative -mx-4 sm:mx-0">
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pl-4 sm:pl-0 pr-12 sm:pr-0 [overscroll-behavior-x:contain]">
            {getDatePresets().map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setDateFrom(p.from);
                  setDateTo(p.to);
                  setActivePreset(p.label);
                }}
                className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] transition-colors ${
                  activePreset === p.label
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-ink-1/60 text-ink-3 border border-ink-2 hover:text-ink-4 hover:border-ink-3"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 bottom-0 w-10 sm:hidden bg-gradient-to-l from-ink-0 to-transparent"
          />
        </div>
      </div>

      {/* Transactions table */}
      {transactions === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading transactions…
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No transactions yet. Import a bank CSV above to get started.
          </p>
        </div>
      ) : (
        <TransactionsTable
          transactions={transactions}
          onPatchCategory={patchCategory}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`growth-in fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportDropzone
// ---------------------------------------------------------------------------

function ImportDropzone({
  importing,
  onFiles,
}: {
  importing: boolean;
  onFiles: (files: FileList | File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-md border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
        dragOver
          ? "border-accent bg-accent/5"
          : "border-ink-2 bg-ink-1/50 hover:border-ink-3"
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
      {importing ? (
        <Mono className="text-sm text-accent">Importing…</Mono>
      ) : (
        <>
          <p className="text-sm text-text-1">
            Drop bank CSV files here, or click to browse
          </p>
          <Mono className="text-[11px] text-ink-3 mt-1">
            Halifax, Revolut, Amex, and PayPal · duplicates skipped automatically
          </Mono>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportResultsBanner
// ---------------------------------------------------------------------------

function ImportResultsBanner({
  results,
  onDismiss,
}: {
  results: ImportResult[];
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Import Results
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
        >
          Dismiss
        </button>
      </div>
      {results.map((r, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Mono className="text-sm text-text-0">{r.file}</Mono>
            <Mono className="text-[11px] text-ok">{r.imported} imported</Mono>
            {r.skipped > 0 && (
              <Mono className="text-[11px] text-ink-3">
                {r.skipped} skipped
              </Mono>
            )}
            {r.skipped_by_state != null && r.skipped_by_state > 0 && (
              <Mono className="text-[11px] text-ink-3">
                {r.skipped_by_state} filtered (non-completed)
              </Mono>
            )}
          </div>
          {r.paypal_summary && (
            <div className="flex items-center gap-3 pl-2">
              <Mono className="text-[11px] text-ink-3">
                {r.paypal_summary.total_payments} payments · {r.paypal_summary.balance_funded} balance · {r.paypal_summary.card_funded + r.paypal_summary.bank_funded} card/bank (pending match)
              </Mono>
            </div>
          )}
          {r.errors.length > 0 && (
            <div className="flex flex-col gap-0.5 pl-2">
              {r.errors.map((err, j) => (
                <div
                  key={j}
                  className="text-[11px] text-danger font-[family-name:var(--font-mono)]"
                >
                  {err.line > 0 ? `Line ${err.line}: ` : ""}
                  {err.reason}
                  {err.raw && (
                    <span className="text-ink-3 ml-2 truncate inline-block max-w-[40ch] align-bottom">
                      {err.raw}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransactionsTable
// ---------------------------------------------------------------------------

function TransactionsTable({
  transactions,
  onPatchCategory,
}: {
  transactions: Transaction[];
  onPatchCategory: (id: string, category: string) => void;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-2">
            <Th>Date</Th>
            <Th>Description</Th>
            <Th>Type</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Balance</Th>
            <Th>Account</Th>
            <Th>Category</Th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <TransactionRow
              key={t.id}
              txn={t}
              onPatchCategory={onPatchCategory}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] font-medium whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TransactionRow({
  txn,
  onPatchCategory,
}: {
  txn: Transaction;
  onPatchCategory: (id: string, category: string) => void;
}) {
  const amountColor = txn.amount >= 0 ? "text-ok" : "text-danger";

  return (
    <tr className="border-b border-ink-2/40 hover:bg-ink-2/30 transition-colors">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Mono className="text-text-1 text-[13px]">{fmtDate(txn.txn_date)}</Mono>
      </td>
      <td className="px-3 py-1.5 max-w-[300px]">
        {txn.enriched_merchant ? (
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-text-0 truncate"><PrivateText>{txn.enriched_merchant}</PrivateText></span>
              <span className="shrink-0 text-[9px] uppercase tracking-[0.18em] text-accent/60 font-[family-name:var(--font-mono)] border border-accent/20 rounded px-1 py-px">
                via PayPal
              </span>
            </div>
            <span className="text-[11px] text-ink-3 truncate"><PrivateText>{txn.description}</PrivateText></span>
          </div>
        ) : (
          <span className="text-text-0 truncate block"><PrivateText>{txn.description}</PrivateText></span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <Mono className="text-[11px] text-ink-3">{txn.txn_type}</Mono>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Mono className={`text-[13px] ${amountColor}`}>
          <Money value={txn.amount} format="amount" />
        </Mono>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Mono className="text-[13px] text-text-1">
          {txn.balance != null ? <Money value={Number(txn.balance)} format="balance" /> : "—"}
        </Mono>
      </td>
      <td className="px-3 py-1.5">
        <Mono className="text-[11px] text-ink-3">
          {txn.account_label ?? txn.account_number ?? "—"}
        </Mono>
      </td>
      <td className="px-3 py-1.5 min-w-[160px]">
        <select
          value={txn.category ?? ""}
          onChange={(e) => onPatchCategory(txn.id, e.target.value)}
          className={`w-full bg-transparent rounded-sm text-sm px-1 py-0.5 -mx-1 outline-none hover:bg-ink-2/40 focus:ring-1 focus:ring-glow-2/60 transition-colors cursor-pointer ${
            txn.category ? "text-text-0" : "text-ink-3"
          }`}
        >
          <option value="">—</option>
          {TAXONOMY.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// MultiSelect
// ---------------------------------------------------------------------------

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  const display =
    selected.length === 0 ? label : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 rounded-md border text-sm outline-none transition-colors ${
          selected.length > 0
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-ink-2 bg-ink-0/40 text-ink-4 hover:border-ink-3"
        }`}
      >
        {display}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-ink-1 border border-ink-2 rounded-md shadow-lg max-h-60 overflow-y-auto min-w-[200px]">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-ink-2/40 cursor-pointer text-sm text-text-1"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-[var(--color-accent)]"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PayPalMatchPanel
// ---------------------------------------------------------------------------

function PayPalMatchPanel({
  counts,
  ambiguous,
  matching,
  syncing,
  onRerun,
  onSync,
  onResolve,
}: {
  counts: MatchCounts;
  ambiguous: AmbiguousPayment[];
  matching: boolean;
  syncing: boolean;
  onRerun: () => void;
  onSync: () => void;
  onResolve: (paymentId: string, transactionId: string) => void;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          PayPal Matching
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent/80 disabled:text-ink-3 font-[family-name:var(--font-mono)] transition-colors"
          >
            {syncing ? "Syncing…" : "Sync PayPal"}
          </button>
          <button
            type="button"
            onClick={onRerun}
            disabled={matching}
            className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent/80 disabled:text-ink-3 font-[family-name:var(--font-mono)] transition-colors"
          >
            {matching ? "Matching…" : "Re-run matching"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Mono className="text-[11px] text-ok">{counts.matched} matched</Mono>
        {counts.ambiguous > 0 && (
          <Mono className="text-[11px] text-yellow-400">
            {counts.ambiguous} ambiguous
          </Mono>
        )}
        {counts.pending > 0 && (
          <Mono className="text-[11px] text-ink-3">
            {counts.pending} pending (no statement yet)
          </Mono>
        )}
      </div>

      {ambiguous.length > 0 && (
        <div className="flex flex-col gap-2">
          {ambiguous.map((p) => (
            <div
              key={p.id}
              className="rounded bg-ink-0/40 border border-ink-2 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-text-0 font-medium">
                  {p.merchant_name ?? "Unknown"}
                </span>
                <Mono className="text-[11px] text-danger">
                  <Money value={p.amount} format="amount" />
                </Mono>
                <Mono className="text-[11px] text-ink-3">
                  {fmtDate(p.paypal_date)}
                </Mono>
                {p.currency !== "GBP" && (
                  <Mono className="text-[10px] text-yellow-400">
                    {p.currency}
                  </Mono>
                )}
              </div>
              {p.candidates.length > 0 ? (
                <div className="flex flex-col gap-1.5 pl-2 border-l border-ink-2 ml-1">
                  {p.candidates.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onResolve(p.id, c.id)}
                        className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent/80 font-[family-name:var(--font-mono)] shrink-0 transition-colors"
                      >
                        This one
                      </button>
                      <span className="text-[12px] text-text-1 truncate min-w-0">
                        <PrivateText>{c.description}</PrivateText>
                      </span>
                      <Mono className="text-[11px] text-ink-3 shrink-0">
                        {fmtDate(c.txn_date)}
                      </Mono>
                      <Mono className="text-[11px] text-ink-3 shrink-0">
                        {c.account_label ?? c.account_type}
                      </Mono>
                    </div>
                  ))}
                </div>
              ) : (
                <Mono className="text-[11px] text-ink-3 pl-2">
                  No candidates found
                </Mono>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
