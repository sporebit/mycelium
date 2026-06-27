"use client";
// DRAFT: Open question -- whether this folds into a contracts model with billing fields.

import { useState, useMemo } from "react";

type AccountStatus = "active" | "inactive" | "cancelled";

type ServiceAccount = {
  id: string;
  name: string;
  email: string;
  purpose: string;
  status: AccountStatus;
  opened: string;
  monthlyCost: number | null;
  notes: string;
};

const SAMPLE_ACCOUNTS: ServiceAccount[] = [
  { id: "a1", name: "Spotify", email: "pwhelanonline@gmail.com", purpose: "Music streaming", status: "active", opened: "2019-03-15", monthlyCost: 10.99, notes: "Family plan" },
  { id: "a2", name: "GitHub", email: "pwhelanonline@gmail.com", purpose: "Code hosting and CI", status: "active", opened: "2017-08-01", monthlyCost: null, notes: "Free tier, Pro via work" },
  { id: "a3", name: "AWS", email: "pwhelanonline@gmail.com", purpose: "Cloud infra for side projects", status: "active", opened: "2020-01-10", monthlyCost: 14.50, notes: "Mostly S3 and Lambda" },
  { id: "a4", name: "Adobe Creative Cloud", email: "pwhelanonline@gmail.com", purpose: "Design and video editing", status: "cancelled", opened: "2021-06-01", monthlyCost: null, notes: "Cancelled Jan 2025, moved to Figma + DaVinci" },
  { id: "a5", name: "Vercel", email: "pwhelanonline@gmail.com", purpose: "Frontend deployment", status: "active", opened: "2023-02-20", monthlyCost: 20.00, notes: "Pro plan for Myphelium2" },
  { id: "a6", name: "NordVPN", email: "pwhelanonline@gmail.com", purpose: "VPN", status: "inactive", opened: "2022-11-01", monthlyCost: null, notes: "Annual plan expired, deciding whether to renew" },
];

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function statusBadgeClass(s: AccountStatus): string {
  switch (s) {
    case "active":
      return "border-ok/40 text-ok bg-ok/10";
    case "inactive":
      return "border-warn/40 text-warn bg-warn/10";
    case "cancelled":
      return "border-ink-2 text-ink-3 bg-ink-0";
  }
}

const inputClass =
  "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";

export function AccountsClient() {
  const [accounts] = useState<ServiceAccount[]>(SAMPLE_ACCOUNTS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.purpose.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accounts, search, statusFilter]);

  const totalMonthlyCost = accounts
    .filter((a) => a.status === "active" && a.monthlyCost)
    .reduce((sum, a) => sum + (a.monthlyCost ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Accounts
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          Service register and subscriptions.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className={inputClass + " sm:max-w-xs"}
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive", "cancelled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase transition-colors ${
                statusFilter === s
                  ? "bg-accent/15 border border-accent/50 text-accent"
                  : "border border-ink-2 text-ink-3 hover:text-ink-4"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        Active monthly cost:{" "}
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-ink-4">
          {"£"}{totalMonthlyCost.toFixed(2)}
        </span>
      </div>

      {/* Accounts list */}
      {filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
          No matching services.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((a) => (
            <li
              key={a.id}
              className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-4 font-medium">{a.name}</span>
                <span
                  className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${statusBadgeClass(a.status)}`}
                >
                  {a.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                <span>{a.email}</span>
                <span>{a.purpose}</span>
                <span className="font-[family-name:var(--font-mono)] tabular-nums">
                  Opened {formatDate(a.opened)}
                </span>
                {a.monthlyCost != null && (
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {"£"}{a.monthlyCost.toFixed(2)}/mo
                  </span>
                )}
              </div>
              {a.notes && (
                <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                  {a.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
