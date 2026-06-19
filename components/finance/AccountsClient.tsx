"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { Money, PrivateText } from "@/components/finance/Money";

type Toast = { kind: "ok" | "error"; text: string } | null;

type Account = {
  id: string;
  name: string;
  email: string | null;
  url: string | null;
  category: string;
  status: string;
  cost_amount: number | null;
  cost_currency: string;
  cost_period: string | null;
  renewal_date: string | null;
  payment_method: string | null;
  opened_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type StatusFilter = "all" | "active" | "trial" | "paused" | "cancelled";

const STATUSES = ["active", "trial", "paused", "cancelled"];
const CATEGORIES = [
  "Entertainment",
  "Productivity",
  "Infrastructure",
  "Finance",
  "Health",
  "Shopping",
  "Other",
];
const PERIODS = ["monthly", "annual", "one_off"];

const STATUS_STYLE: Record<string, string> = {
  active: "text-ok bg-ok/15 border-ok/40",
  trial: "text-warn bg-warn/15 border-warn/40",
  paused: "text-ink-3 bg-ink-2/40 border-ink-2",
  cancelled: "text-danger bg-danger/15 border-danger/40",
};

const PERIOD_LABEL: Record<string, string> = {
  monthly: "/mo",
  annual: "/yr",
  one_off: " one-off",
};

function monthlyEquiv(amount: number | null, period: string | null): number {
  if (amount == null || !period) return 0;
  if (period === "annual") return amount / 12;
  if (period === "monthly") return amount;
  return 0;
}

function formatCost(a: Account): string | null {
  if (a.cost_amount == null || !a.cost_period) return null;
  const sym = a.cost_currency === "USD" ? "$" : a.cost_currency === "EUR" ? "€" : "£";
  const amt = a.cost_amount % 1 === 0 ? a.cost_amount.toString() : a.cost_amount.toFixed(2);
  const suffix = PERIOD_LABEL[a.cost_period] ?? "";
  let s = `${sym}${amt}${suffix}`;
  if (a.cost_period === "annual") {
    const mo = (a.cost_amount / 12).toFixed(2);
    s += ` (${sym}${mo}/mo)`;
  }
  return s;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function faviconUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

const EMPTY_ACCOUNT: Omit<Account, "id" | "created_at" | "updated_at"> = {
  name: "",
  email: null,
  url: null,
  category: "Other",
  status: "active",
  cost_amount: null,
  cost_currency: "GBP",
  cost_period: null,
  renewal_date: null,
  payment_method: null,
  opened_date: null,
  notes: null,
};

export function AccountsClient() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [draft, setDraft] = useState(EMPTY_ACCOUNT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/finance/service-accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { accounts?: Account[] }) => {
        setAccounts(Array.isArray(j?.accounts) ? j.accounts : []);
        setLoading(false);
      })
      .catch(() => {
        setAccounts([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function show(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  function openAdd() {
    setEditing(null);
    setDraft(EMPTY_ACCOUNT);
    setModalOpen(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setDraft({
      name: a.name,
      email: a.email,
      url: a.url,
      category: a.category,
      status: a.status,
      cost_amount: a.cost_amount,
      cost_currency: a.cost_currency,
      cost_period: a.cost_period,
      renewal_date: a.renewal_date,
      payment_method: a.payment_method,
      opened_date: a.opened_date,
      notes: a.notes,
    });
    setModalOpen(true);
  }

  async function saveAccount() {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        cost_amount: draft.cost_amount !== null && draft.cost_amount !== undefined
          ? Number(draft.cost_amount)
          : null,
      };

      if (editing) {
        const r = await fetch(`/api/finance/service-accounts/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { show("error", j.error ?? "Update failed"); return; }
        setAccounts((cur) => cur.map((a) => (a.id === editing.id ? j.account : a)));
        show("ok", "Updated");
      } else {
        const r = await fetch("/api/finance/service-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { show("error", j.error ?? "Add failed"); return; }
        setAccounts((cur) => [...cur, j.account]);
        show("ok", "Added");
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(id: string) {
    if (!window.confirm("Delete this account?")) return;
    const r = await fetch(`/api/finance/service-accounts/${id}`, { method: "DELETE" });
    if (!r.ok) { show("error", "Delete failed"); return; }
    setAccounts((cur) => cur.filter((a) => a.id !== id));
    show("ok", "Deleted");
  }

  const filtered = accounts.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    return true;
  });

  const totalMonthly = accounts
    .filter((a) => a.status === "active" || a.status === "trial")
    .reduce((sum, a) => sum + monthlyEquiv(a.cost_amount, a.cost_period), 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Accounts
          </h1>
          <Mono className="text-sm text-ink-3">
            <PrivateText>
              <Money value={totalMonthly} format="balance" />/mo
            </PrivateText>
          </Mono>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          ADD ACCOUNT
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s as StatusFilter)}
              className={`px-2 py-1 rounded-md transition-colors ${
                statusFilter === s
                  ? "bg-accent/15 text-accent"
                  : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1 rounded-md border border-ink-2 bg-transparent text-ink-3 cursor-pointer outline-none"
        >
          <option value="all">ALL CATEGORIES</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {accounts.length === 0 ? "No accounts yet — add one above." : "No accounts match filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onEdit={() => openEdit(a)}
              onDelete={() => deleteAccount(a.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <AccountModal
          draft={draft}
          setDraft={setDraft}
          editing={!!editing}
          saving={saving}
          onSave={saveAccount}
          onClose={() => setModalOpen(false)}
        />
      )}

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

/* ─── Card ─────────────────────────────────────────────────── */

function AccountCard({
  account: a,
  onEdit,
  onDelete,
}: {
  account: Account;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [faviconOk, setFaviconOk] = useState(true);
  const favicon = faviconUrl(a.url);
  const cost = formatCost(a);
  const isCancelled = a.status === "cancelled";
  const renewalDays = a.renewal_date ? daysUntil(a.renewal_date) : null;
  const renewingSoon = renewalDays !== null && renewalDays >= 0 && renewalDays <= 7;

  return (
    <div
      className={`group bg-ink-1 hover:bg-ink-2/60 rounded-md p-4 transition-colors flex flex-col gap-3 ${
        isCancelled ? "opacity-60" : ""
      }`}
    >
      {/* Top row: icon + name + chips */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center overflow-hidden bg-accent/15">
          {favicon && faviconOk ? (
            <img
              src={favicon}
              alt=""
              width={20}
              height={20}
              className="w-5 h-5"
              onError={() => setFaviconOk(false)}
            />
          ) : (
            <span className="text-sm font-semibold text-accent">
              {a.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${isCancelled ? "text-ink-3 line-through" : "text-ink-4"}`}>
            {a.name}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${
            STATUS_STYLE[a.status] ?? "text-ink-3 bg-ink-2/40 border-ink-2"
          }`}
        >
          {a.status}
        </span>
        <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-2/40 text-ink-3 shrink-0">
          {a.category}
        </span>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1 text-[11px] text-ink-3 font-[family-name:var(--font-mono)]">
        {cost && (
          <div className="text-ink-4">
            <PrivateText>{cost}</PrivateText>
          </div>
        )}
        {a.renewal_date && (
          <div className={renewingSoon ? "text-warn" : ""}>
            Renews {a.renewal_date}
            {renewingSoon && ` (${renewalDays === 0 ? "today" : `in ${renewalDays}d`})`}
          </div>
        )}
        {a.email && (
          <div className="truncate">
            <PrivateText>{a.email}</PrivateText>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        <Link
          href={`/finance/spending?q=${encodeURIComponent(a.name)}`}
          className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-wide transition-colors"
        >
          VIEW TRANSACTIONS →
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-wide transition-opacity"
        >
          EDIT
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)] tracking-wide transition-opacity"
        >
          DELETE
        </button>
      </div>
    </div>
  );
}

/* ─── Modal ────────────────────────────────────────────────── */

type DraftAccount = Omit<Account, "id" | "created_at" | "updated_at">;

function AccountModal({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
  onClose,
}: {
  draft: DraftAccount;
  setDraft: (d: DraftAccount) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  function set<K extends keyof DraftAccount>(k: K, v: DraftAccount[K]) {
    setDraft({ ...draft, [k]: v });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-0/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0">
          {editing ? "Edit Account" : "Add Account"}
        </h2>

        <Field label="Name" required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="Netflix"
          />
        </Field>

        <Field label="URL / Website">
          <input
            type="text"
            value={draft.url ?? ""}
            onChange={(e) => set("url", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="https://netflix.com"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => set("email", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="you@email.com"
          />
        </Field>

        <Field label="Category">
          <select
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Cost">
            <input
              type="number"
              step="0.01"
              value={draft.cost_amount ?? ""}
              onChange={(e) => set("cost_amount", e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              placeholder="10.99"
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={draft.cost_currency}
              onChange={(e) => set("cost_currency", e.target.value.toUpperCase())}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              maxLength={3}
            />
          </Field>
          <Field label="Period">
            <select
              value={draft.cost_period ?? ""}
              onChange={(e) => set("cost_period", e.target.value || null)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            >
              <option value="">—</option>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{p.replace("_", " ")}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Renewal Date">
          <input
            type="date"
            value={draft.renewal_date ?? ""}
            onChange={(e) => set("renewal_date", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
          />
        </Field>

        <Field label="Payment Method">
          <input
            type="text"
            value={draft.payment_method ?? ""}
            onChange={(e) => set("payment_method", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="Visa ending 4242"
          />
        </Field>

        <Field label="Opened Date">
          <input
            type="date"
            value={draft.opened_date ?? ""}
            onChange={(e) => set("opened_date", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3 min-h-[60px] resize-y"
            placeholder="Any notes…"
          />
        </Field>

        <div className="flex items-center gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 border border-ink-2 hover:border-ink-3 transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!draft.name.trim() || saving}
            className="px-4 py-2 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            {saving ? "…" : editing ? "SAVE" : "ADD"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <Mono className="text-[10px] text-ink-3">
        {label.toUpperCase()}
        {required && <span className="text-accent ml-0.5">*</span>}
      </Mono>
      {children}
    </label>
  );
}
