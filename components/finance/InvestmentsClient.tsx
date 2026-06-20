"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { Money, PrivateText } from "@/components/finance/Money";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type Toast = { kind: "ok" | "error"; text: string } | null;

type Investment = {
  id: string;
  name: string;
  ticker: string | null;
  category: string;
  sub_category: string | null;
  quantity: number;
  buy_price: number;
  buy_currency: string;
  buy_date: string | null;
  current_price: number | null;
  current_price_updated_at: string | null;
  platform: string | null;
  notes: string | null;
  image_url: string | null;
  sold: boolean;
  sell_price: number | null;
  sell_date: string | null;
  created_at: string;
};

type CategoryFilter = "all" | "stock" | "etf" | "crypto" | "commodity" | "collectible" | "sneakers" | "cards" | "other";
type StatusFilter = "active" | "sold" | "all";

const CATEGORIES = ["stock", "etf", "crypto", "commodity", "collectible", "sneakers", "cards", "other"] as const;

const CATEGORY_COLOURS: Record<string, string> = {
  stock: "#5de8e0",
  etf: "#f5b56d",
  crypto: "#a78bfa",
  commodity: "#f59e0b",
  collectible: "#ec4899",
  sneakers: "#6366f1",
  cards: "#ef4444",
  other: "#6b7280",
};

const CATEGORY_LABELS: Record<string, string> = {
  stock: "Stocks",
  etf: "ETFs",
  crypto: "Crypto",
  commodity: "Commodities",
  collectible: "Collectibles",
  sneakers: "Sneakers",
  cards: "Cards",
  other: "Other",
};

const EMPTY_DRAFT = {
  name: "",
  ticker: "",
  category: "stock" as string,
  sub_category: "",
  quantity: "",
  buy_price: "",
  buy_currency: "GBP",
  buy_date: "",
  current_price: "",
  platform: "",
  notes: "",
  image_url: "",
};

type Draft = typeof EMPTY_DRAFT;

function pnl(inv: Investment): { value: number; pct: number } | null {
  const price = inv.sold ? inv.sell_price : inv.current_price;
  if (price == null) return null;
  const cost = inv.quantity * inv.buy_price;
  const current = inv.quantity * price;
  const value = current - cost;
  const pct = cost > 0 ? (value / cost) * 100 : 0;
  return { value, pct };
}

function currentValue(inv: Investment): number {
  const price = inv.sold ? (inv.sell_price ?? inv.buy_price) : (inv.current_price ?? inv.buy_price);
  return inv.quantity * price;
}

function totalCost(inv: Investment): number {
  return inv.quantity * inv.buy_price;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function InvestmentsClient() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [sellModal, setSellModal] = useState<Investment | null>(null);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [sellDraft, setSellDraft] = useState({ sell_price: "", sell_date: "" });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    fetch("/api/finance/investments", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { investments?: Investment[] }) => {
        setInvestments(Array.isArray(j?.investments) ? j.investments : []);
        setLoading(false);
      })
      .catch(() => { setInvestments([]); setLoading(false); });
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
    setDraft({ ...EMPTY_DRAFT });
    setModalOpen(true);
  }

  function openEdit(inv: Investment) {
    setEditing(inv);
    setDraft({
      name: inv.name,
      ticker: inv.ticker ?? "",
      category: inv.category,
      sub_category: inv.sub_category ?? "",
      quantity: String(inv.quantity),
      buy_price: String(inv.buy_price),
      buy_currency: inv.buy_currency,
      buy_date: inv.buy_date ?? "",
      current_price: inv.current_price != null ? String(inv.current_price) : "",
      platform: inv.platform ?? "",
      notes: inv.notes ?? "",
      image_url: inv.image_url ?? "",
    });
    setModalOpen(true);
  }

  async function saveInvestment() {
    if (!draft.name.trim() || !draft.quantity || !draft.buy_price || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        ticker: draft.ticker.trim() || null,
        category: draft.category,
        sub_category: draft.sub_category.trim() || null,
        quantity: Number(draft.quantity),
        buy_price: Number(draft.buy_price),
        buy_currency: draft.buy_currency || "GBP",
        buy_date: draft.buy_date || null,
        current_price: draft.current_price ? Number(draft.current_price) : null,
        platform: draft.platform.trim() || null,
        notes: draft.notes.trim() || null,
        image_url: draft.image_url.trim() || null,
      };

      if (editing) {
        const r = await fetch(`/api/finance/investments/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { show("error", j.error ?? "Update failed"); return; }
        setInvestments((cur) => cur.map((i) => (i.id === editing.id ? j.investment : i)));
        show("ok", "Updated");
      } else {
        const r = await fetch("/api/finance/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { show("error", j.error ?? "Add failed"); return; }
        setInvestments((cur) => [j.investment, ...cur]);
        show("ok", "Added");
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvestment(id: string) {
    if (!window.confirm("Delete this investment?")) return;
    const r = await fetch(`/api/finance/investments/${id}`, { method: "DELETE" });
    if (!r.ok) { show("error", "Delete failed"); return; }
    setInvestments((cur) => cur.filter((i) => i.id !== id));
    show("ok", "Deleted");
  }

  async function markSold() {
    if (!sellModal || !sellDraft.sell_price || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/finance/investments/${sellModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sold: true,
          sell_price: Number(sellDraft.sell_price),
          sell_date: sellDraft.sell_date || new Date().toISOString().split("T")[0],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { show("error", j.error ?? "Sell failed"); return; }
      setInvestments((cur) => cur.map((i) => (i.id === sellModal.id ? j.investment : i)));
      show("ok", "Marked as sold");
      setSellModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function refreshPrices() {
    setRefreshing(true);
    try {
      const r = await fetch("/api/finance/investments/refresh-prices", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { show("error", j.error ?? "Refresh failed"); return; }
      show("ok", `Updated ${j.updated} price${j.updated !== 1 ? "s" : ""}${j.failed ? `, ${j.failed} failed` : ""}`);
      load();
    } finally {
      setRefreshing(false);
    }
  }

  const active = investments.filter((i) => !i.sold);
  const filtered = investments.filter((i) => {
    if (statusFilter === "active" && i.sold) return false;
    if (statusFilter === "sold" && !i.sold) return false;
    if (catFilter !== "all" && i.category !== catFilter) return false;
    return true;
  });

  const portfolioValue = active.reduce((s, i) => s + currentValue(i), 0);
  const portfolioCost = active.reduce((s, i) => s + totalCost(i), 0);
  const totalPnl = portfolioValue - portfolioCost;
  const totalPnlPct = portfolioCost > 0 ? (totalPnl / portfolioCost) * 100 : 0;

  const allocationData = Object.entries(
    active.reduce<Record<string, number>>((acc, inv) => {
      acc[inv.category] = (acc[inv.category] ?? 0) + currentValue(inv);
      return acc;
    }, {}),
  )
    .map(([cat, value]) => ({ name: CATEGORY_LABELS[cat] ?? cat, value, colour: CATEGORY_COLOURS[cat] ?? "#6b7280" }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Investments
          </h1>
          <Mono className="text-sm text-ink-3">
            <PrivateText>
              <Money value={portfolioValue} format="balance" />
            </PrivateText>
          </Mono>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshPrices}
            disabled={refreshing}
            className="px-3 py-2 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors disabled:opacity-40"
          >
            {refreshing ? "REFRESHING…" : "REFRESH PRICES"}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            ADD HOLDING
          </button>
        </div>
      </header>

      {/* Portfolio summary */}
      {active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
          <div className="bg-ink-1 rounded-md p-4 flex flex-col gap-3">
            <Mono className="text-[10px] text-ink-3">PORTFOLIO SUMMARY</Mono>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Mono className="text-[9px] text-ink-3">TOTAL VALUE</Mono>
                <div className="text-lg text-text-0 font-[family-name:var(--font-mono)]">
                  <PrivateText><Money value={portfolioValue} format="balance" /></PrivateText>
                </div>
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3">TOTAL COST</Mono>
                <div className="text-lg text-text-0 font-[family-name:var(--font-mono)]">
                  <PrivateText><Money value={portfolioCost} format="balance" /></PrivateText>
                </div>
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3">TOTAL P&L</Mono>
                <div className={`text-lg font-[family-name:var(--font-mono)] ${totalPnl >= 0 ? "text-ok" : "text-danger"}`}>
                  <PrivateText>
                    <Money value={totalPnl} format="amount" />
                    <span className="text-sm ml-1">(<Money value={totalPnlPct} format="percent" />)</span>
                  </PrivateText>
                </div>
              </div>
            </div>
          </div>

          {allocationData.length > 1 && (
            <div className="bg-ink-1 rounded-md p-4 flex flex-col items-center gap-2">
              <Mono className="text-[10px] text-ink-3">ALLOCATION</Mono>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    strokeWidth={0}
                  >
                    {allocationData.map((d, idx) => (
                      <Cell key={idx} fill={d.colour} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1a1917", border: "1px solid #333", borderRadius: 6, fontSize: 11 }}
                    formatter={(val) => [`£${Number(val).toFixed(2)}`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {allocationData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.colour }} />
                    <Mono className="text-[9px] text-ink-3">{d.name}</Mono>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
          {(["active", "sold", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
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
        <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c as CategoryFilter)}
              className={`px-2 py-1 rounded-md transition-colors ${
                catFilter === c
                  ? "bg-accent/15 text-accent"
                  : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {(CATEGORY_LABELS[c] ?? c).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {investments.length === 0 ? "No investments yet — add one above." : "No investments match filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((inv) => (
            <HoldingCard
              key={inv.id}
              investment={inv}
              onEdit={() => openEdit(inv)}
              onDelete={() => deleteInvestment(inv.id)}
              onSell={() => {
                setSellDraft({ sell_price: "", sell_date: new Date().toISOString().split("T")[0] });
                setSellModal(inv);
              }}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <InvestmentModal
          draft={draft}
          setDraft={setDraft}
          editing={!!editing}
          saving={saving}
          onSave={saveInvestment}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Sell Modal */}
      {sellModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-0/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSellModal(null); }}
        >
          <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0">
              Sell {sellModal.name}
            </h2>
            <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)]">
              {sellModal.quantity} × bought at £{Number(sellModal.buy_price).toFixed(2)}
            </p>
            <Field label="Sell Price (per unit)" required>
              <input
                type="number"
                step="0.01"
                value={sellDraft.sell_price}
                onChange={(e) => setSellDraft((d) => ({ ...d, sell_price: e.target.value }))}
                className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
                placeholder="0.00"
              />
            </Field>
            <Field label="Sell Date">
              <input
                type="date"
                value={sellDraft.sell_date}
                onChange={(e) => setSellDraft((d) => ({ ...d, sell_date: e.target.value }))}
                className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              />
            </Field>
            {sellDraft.sell_price && (
              <div className="text-xs font-[family-name:var(--font-mono)]">
                <PrivateText>
                  <span className="text-ink-3">P&L: </span>
                  <span className={
                    (Number(sellDraft.sell_price) - sellModal.buy_price) >= 0 ? "text-ok" : "text-danger"
                  }>
                    £{((Number(sellDraft.sell_price) - sellModal.buy_price) * sellModal.quantity).toFixed(2)}
                  </span>
                </PrivateText>
              </div>
            )}
            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setSellModal(null)}
                className="px-4 py-2 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 border border-ink-2 hover:border-ink-3 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={markSold}
                disabled={!sellDraft.sell_price || saving}
                className="px-4 py-2 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
              >
                {saving ? "…" : "CONFIRM SELL"}
              </button>
            </div>
          </div>
        </div>
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

/* ─── Holding Card ────────────────────────────────────────── */

function HoldingCard({
  investment: inv,
  onEdit,
  onDelete,
  onSell,
}: {
  investment: Investment;
  onEdit: () => void;
  onDelete: () => void;
  onSell: () => void;
}) {
  const pl = pnl(inv);
  const val = currentValue(inv);
  const catColour = CATEGORY_COLOURS[inv.category] ?? "#6b7280";

  return (
    <div className={`group bg-ink-1 hover:bg-ink-2/60 rounded-md p-4 transition-colors flex flex-col gap-3 ${inv.sold ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold"
          style={{ background: `${catColour}22`, color: catColour }}
        >
          {inv.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${inv.sold ? "text-ink-3 line-through" : "text-ink-4"}`}>
            {inv.name}
          </div>
          {inv.ticker && (
            <Mono className="text-[10px] text-ink-3">{inv.ticker}</Mono>
          )}
        </div>
        <span
          className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0"
          style={{ borderColor: `${catColour}66`, color: catColour, background: `${catColour}15` }}
        >
          {inv.category}
        </span>
        {inv.sold && (
          <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-2/40 text-ink-3 shrink-0">
            SOLD
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] font-[family-name:var(--font-mono)]">
        <div>
          <div className="text-ink-3 text-[9px]">QTY × BUY</div>
          <div className="text-ink-4">
            <PrivateText>
              {Number(inv.quantity)} × £{Number(inv.buy_price).toFixed(2)}
            </PrivateText>
          </div>
        </div>
        <div>
          <div className="text-ink-3 text-[9px]">VALUE</div>
          <div className="text-ink-4">
            <PrivateText><Money value={val} format="balance" /></PrivateText>
          </div>
        </div>
        <div>
          <div className="text-ink-3 text-[9px]">P&L</div>
          {pl ? (
            <div className={pl.value >= 0 ? "text-ok" : "text-danger"}>
              <PrivateText>
                <Money value={pl.value} format="amount" />
                <span className="text-[9px] ml-0.5">(<Money value={pl.pct} format="percent" decimals={1} />)</span>
              </PrivateText>
            </div>
          ) : (
            <div className="text-ink-3">—</div>
          )}
        </div>
      </div>

      {inv.current_price_updated_at && !inv.sold && (
        <Mono className="text-[9px] text-ink-3">
          Price updated {timeAgo(inv.current_price_updated_at)}
        </Mono>
      )}

      {inv.platform && (
        <Mono className="text-[9px] text-ink-3">
          Platform: {inv.platform}
        </Mono>
      )}

      <div className="flex items-center gap-2 mt-auto">
        {!inv.sold && (
          <button
            type="button"
            onClick={onSell}
            className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-wide transition-colors"
          >
            SELL
          </button>
        )}
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

/* ─── Add/Edit Modal ──────────────────────────────────────── */

function InvestmentModal({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft({ ...draft, [k]: v });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-0/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0">
          {editing ? "Edit Holding" : "Add Holding"}
        </h2>

        <Field label="Name" required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="Apple Inc."
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Ticker">
            <input
              type="text"
              value={draft.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              placeholder="AAPL"
            />
          </Field>
          <Field label="Category" required>
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Quantity" required>
            <input
              type="number"
              step="any"
              value={draft.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              placeholder="10"
            />
          </Field>
          <Field label="Buy Price" required>
            <input
              type="number"
              step="0.01"
              value={draft.buy_price}
              onChange={(e) => set("buy_price", e.target.value)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              placeholder="150.00"
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={draft.buy_currency}
              onChange={(e) => set("buy_currency", e.target.value.toUpperCase())}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              maxLength={3}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Buy Date">
            <input
              type="date"
              value={draft.buy_date}
              onChange={(e) => set("buy_date", e.target.value)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            />
          </Field>
          <Field label="Current Price">
            <input
              type="number"
              step="0.01"
              value={draft.current_price}
              onChange={(e) => set("current_price", e.target.value)}
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
              placeholder="Auto-refresh"
            />
          </Field>
        </div>

        <Field label="Platform">
          <input
            type="text"
            value={draft.platform}
            onChange={(e) => set("platform", e.target.value)}
            className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 px-3 py-2 outline-none focus:border-ink-3"
            placeholder="Trading 212, Coinbase…"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
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
            disabled={!draft.name.trim() || !draft.quantity || !draft.buy_price || saving}
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
