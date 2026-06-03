"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type { Transaction, BankAccount, ImportResult } from "@/lib/types/transaction";

type Toast = { kind: "ok" | "error"; text: string } | null;

function fmtAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount >= 0 ? `+£${abs}` : `-£${abs}`;
}

function fmtDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// SpendingClient
// ---------------------------------------------------------------------------

export function SpendingClient() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    total_in: number;
    total_out: number;
    net: number;
  } | null>(null);

  const [accountFilter, setAccountFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(
    null,
  );
  const [importing, setImporting] = useState(false);

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

  // Fetch transactions whenever filters change.
  const fetchTransactions = useCallback(() => {
    const params = new URLSearchParams();
    if (accountFilter !== "all") params.set("account_id", accountFilter);
    if (search.trim()) params.set("q", search.trim());
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    let cancelled = false;
    fetch(`/api/finance/transactions?${params}`)
      .then((r) => r.json())
      .then(
        (j: {
          transactions?: Transaction[];
          total?: number;
          summary?: { total_in: number; total_out: number; net: number };
        }) => {
          if (cancelled) return;
          const txns = Array.isArray(j?.transactions) ? j.transactions : [];
          setTransactions(txns);
          setTotal(j?.total ?? txns.length);
          setSummary(j?.summary ?? null);
          // Build unique category set for datalist.
          const cats = new Set<string>();
          for (const t of txns) {
            if (t.category) cats.add(t.category);
          }
          setCategories([...cats].sort());
        },
      )
      .catch(() => setTransactions([]));
    return () => {
      cancelled = true;
    };
  }, [accountFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    return fetchTransactions();
  }, [fetchTransactions]);

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
      // Re-fetch transactions + accounts.
      fetchTransactions();
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

  // Inline category edit.
  async function patchCategory(id: string, category: string) {
    const prev = transactions ?? [];
    setTransactions((cur) =>
      (cur ?? []).map((t) =>
        t.id === id ? { ...t, category: category || null } : t,
      ),
    );
    try {
      const res = await fetch(`/api/finance/transactions/${id}`, {
        method: "PATCH",
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

  return (
    <div className="flex flex-col gap-4">
      {/* Import section */}
      <ImportDropzone
        importing={importing}
        onFiles={handleImport}
      />

      {/* Import results */}
      {importResults && (
        <ImportResultsBanner
          results={importResults}
          onDismiss={() => setImportResults(null)}
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
              +£{summary.total_in.toFixed(2)}
            </Mono>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              OUT
            </span>
            <Mono className="text-sm text-danger">
              -£{Math.abs(summary.total_out).toFixed(2)}
            </Mono>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              NET
            </span>
            <Mono
              className={`text-sm ${summary.net >= 0 ? "text-ok" : "text-danger"}`}
            >
              {summary.net >= 0 ? "+" : "-"}£{Math.abs(summary.net).toFixed(2)}
            </Mono>
          </div>
          <div className="flex-1" />
          <Mono className="text-[11px] text-ink-3">
            {total} transaction{total === 1 ? "" : "s"}
          </Mono>
        </div>
      )}

      {/* Filters */}
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
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 outline-none focus:border-ink-3 transition-colors"
          placeholder="from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 outline-none focus:border-ink-3 transition-colors"
          placeholder="to"
        />
        {(search || dateFrom || dateTo || accountFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setAccountFilter("all");
            }}
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            Clear
          </button>
        )}
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
          categories={categories}
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
            Halifax, Revolut, and Amex · duplicates skipped automatically
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
  categories,
  onPatchCategory,
}: {
  transactions: Transaction[];
  categories: string[];
  onPatchCategory: (id: string, category: string) => void;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 overflow-x-auto">
      <datalist id="cat-suggestions">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.category ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (txn.category ?? "")) {
      onPatchCategory(txn.id, trimmed);
    }
  }

  const amountColor = txn.amount >= 0 ? "text-ok" : "text-danger";

  return (
    <tr className="border-b border-ink-2/40 hover:bg-ink-2/30 transition-colors">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Mono className="text-text-1 text-[13px]">{fmtDate(txn.txn_date)}</Mono>
      </td>
      <td className="px-3 py-1.5 text-text-0 max-w-[300px] truncate">
        {txn.description}
      </td>
      <td className="px-3 py-1.5">
        <Mono className="text-[11px] text-ink-3">{txn.txn_type}</Mono>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Mono className={`text-[13px] ${amountColor}`}>
          {fmtAmount(txn.amount)}
        </Mono>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Mono className="text-[13px] text-text-1">
          {txn.balance != null ? `£${Number(txn.balance).toFixed(2)}` : "—"}
        </Mono>
      </td>
      <td className="px-3 py-1.5">
        <Mono className="text-[11px] text-ink-3">
          {txn.account_label ?? txn.account_number ?? "—"}
        </Mono>
      </td>
      <td className="px-3 py-1.5 min-w-[140px]">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            list="cat-suggestions"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(txn.category ?? "");
                setEditing(false);
              }
            }}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-0.5 outline-none focus:ring-1 focus:ring-glow-2/60"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(txn.category ?? "");
              setEditing(true);
            }}
            className={`text-left text-sm w-full truncate rounded-sm px-1 -mx-1 hover:bg-ink-2/40 transition-colors ${
              txn.category ? "text-text-0" : "text-ink-3 italic"
            }`}
          >
            {txn.category || "—"}
          </button>
        )}
      </td>
    </tr>
  );
}
