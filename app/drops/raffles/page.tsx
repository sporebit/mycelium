"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type RaffleEntry = {
  id: string;
  drop_id: string | null;
  wishlist_item_id: string | null;
  retailer: string;
  item_name: string;
  brand: string;
  size: string | null;
  entry_date: string;
  deadline: string | null;
  result: string | null;
  result_date: string | null;
  retail_price: number | null;
  payment_url: string | null;
  notes: string | null;
};

type ModalState = {
  item_name: string;
  brand: string;
  size: string;
  retailer: string;
  entry_date: string;
  deadline: string;
  retail_price: string;
  payment_url: string;
  result: string;
  drop_id: string;
  wishlist_item_id: string;
  notes: string;
};

const EMPTY_MODAL: ModalState = {
  item_name: "",
  brand: "",
  size: "",
  retailer: "",
  entry_date: new Date().toISOString().slice(0, 16),
  deadline: "",
  retail_price: "",
  payment_url: "",
  result: "pending",
  drop_id: "",
  wishlist_item_id: "",
  notes: "",
};

const RESULT_COLOURS: Record<string, string> = {
  pending: "#f5b56d",
  won: "#84f5b8",
  lost: "#f56d6d",
  not_entered: "#555",
};

const RESULT_LABELS: Record<string, string> = {
  pending: "PENDING",
  won: "WON",
  lost: "LOST",
  not_entered: "NOT ENTERED",
};

type Drop = { id: string; name: string; brand: string };
type WishItem = { id: string; name: string; brand: string };

export default function RafflesPage() {
  const [entries, setEntries] = useState<RaffleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalState>(EMPTY_MODAL);
  const [saving, setSaving] = useState(false);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [wishItems, setWishItems] = useState<WishItem[]>([]);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setNow(Date.now());
    })();
    const iv = setInterval(() => setNow(Date.now()), 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [rRes, dRes, wRes] = await Promise.all([
        fetch("/api/drops/raffles"),
        fetch("/api/drops"),
        fetch("/api/drops/wishlist"),
      ]);
      if (rRes.ok) {
        const j = await rRes.json();
        setEntries(j.entries);
      }
      if (dRes.ok) {
        const j = await dRes.json();
        setDrops(j.drops);
      }
      if (wRes.ok) {
        const j = await wRes.json();
        setWishItems(j.items);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchData();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  const filtered = entries.filter((e) => {
    if (filterResult !== "all" && e.result !== filterResult) return false;
    return true;
  });

  const won = filtered.filter((e) => e.result === "won");
  const rest = filtered.filter((e) => e.result !== "won");

  const stats = {
    total: entries.length,
    pending: entries.filter((e) => e.result === "pending").length,
    won: entries.filter((e) => e.result === "won").length,
    lost: entries.filter((e) => e.result === "lost").length,
  };
  const winRate =
    stats.won + stats.lost > 0
      ? Math.round((stats.won / (stats.won + stats.lost)) * 100)
      : 0;

  async function handleCreate() {
    if (!form.item_name.trim() || !form.brand.trim() || !form.retailer.trim())
      return;
    setSaving(true);
    try {
      const r = await fetch("/api/drops/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: form.item_name,
          brand: form.brand,
          size: form.size || null,
          retailer: form.retailer,
          entry_date: form.entry_date || null,
          deadline: form.deadline || null,
          retail_price: form.retail_price ? Number(form.retail_price) : null,
          payment_url: form.payment_url || null,
          result: form.result,
          drop_id: form.drop_id || null,
          wishlist_item_id: form.wishlist_item_id || null,
          notes: form.notes || null,
        }),
      });
      if (r.ok) {
        setShowModal(false);
        setForm(EMPTY_MODAL);
        await fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateResult(id: string, result: string) {
    await fetch(`/api/drops/raffles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        result_date: new Date().toISOString(),
      }),
    });
    if (result === "won") {
      setCelebrateId(id);
      setTimeout(() => setCelebrateId(null), 3000);
    }
    await fetchData();
  }

  function deadlineUrgency(deadline: string | null): string {
    if (!deadline || !now) return "";
    const diff = new Date(deadline).getTime() - now;
    if (diff < 0) return "text-ink-3 line-through";
    if (diff < 86_400_000) return "text-[#f56d6d]";
    if (diff < 7 * 86_400_000) return "text-[#f5b56d]";
    return "";
  }

  const retailers = [...new Set(entries.map((e) => e.retailer))].sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Raffles
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          LOG ENTRY
        </button>
      </header>

      {/* Stats */}
      <div className="flex gap-4 text-[10px] font-[family-name:var(--font-mono)] text-ink-3 tracking-[0.1em]">
        <span>
          <span className="text-text-0">{stats.total}</span> entered
        </span>
        <span>
          <span className="text-[#84f5b8]">{stats.won}</span> won
        </span>
        <span>
          <span className="text-[#f56d6d]">{stats.lost}</span> lost
        </span>
        <span>
          Win rate:{" "}
          <span className="text-accent">{winRate}%</span>
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "pending", "won", "lost"].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setFilterResult(r)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              filterResult === r
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {r === "all" ? "All" : RESULT_LABELS[r] ?? r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading raffles…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No raffle entries yet. Log one to start tracking.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Won entries first */}
          {won.map((e) => (
            <RaffleRow
              key={e.id}
              entry={e}
              onUpdateResult={updateResult}
              deadlineClass={deadlineUrgency(e.deadline)}
              celebrating={celebrateId === e.id}
              highlight
            />
          ))}
          {rest.map((e) => (
            <RaffleRow
              key={e.id}
              entry={e}
              onUpdateResult={updateResult}
              deadlineClass={deadlineUrgency(e.deadline)}
              celebrating={celebrateId === e.id}
            />
          ))}
        </div>
      )}

      {/* Log Entry modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0 mb-4">
              Log Raffle Entry
            </h2>
            <div className="flex flex-col gap-3">
              <RaffleField
                label="Item name"
                value={form.item_name}
                onChange={(v) => setForm((f) => ({ ...f, item_name: v }))}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <RaffleField
                  label="Brand"
                  value={form.brand}
                  onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
                  required
                />
                <RaffleField
                  label="Size"
                  value={form.size}
                  onChange={(v) => setForm((f) => ({ ...f, size: v }))}
                />
              </div>
              <RaffleField
                label="Retailer"
                value={form.retailer}
                onChange={(v) => setForm((f) => ({ ...f, retailer: v }))}
                required
                list="retailer-list"
              />
              <datalist id="retailer-list">
                {retailers.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-3">
                <RaffleField
                  label="Entry date"
                  value={form.entry_date}
                  onChange={(v) => setForm((f) => ({ ...f, entry_date: v }))}
                  type="datetime-local"
                />
                <RaffleField
                  label="Deadline"
                  value={form.deadline}
                  onChange={(v) => setForm((f) => ({ ...f, deadline: v }))}
                  type="datetime-local"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RaffleField
                  label="Retail price"
                  value={form.retail_price}
                  onChange={(v) => setForm((f) => ({ ...f, retail_price: v }))}
                  type="number"
                />
                <RaffleField
                  label="Payment URL"
                  value={form.payment_url}
                  onChange={(v) => setForm((f) => ({ ...f, payment_url: v }))}
                />
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  RESULT
                </Mono>
                <select
                  value={form.result}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, result: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                >
                  {Object.entries(RESULT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {drops.length > 0 && (
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                    LINK TO DROP
                  </Mono>
                  <select
                    value={form.drop_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, drop_id: e.target.value }))
                    }
                    className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                  >
                    <option value="">None</option>
                    {drops.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.brand} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {wishItems.length > 0 && (
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                    LINK TO WISHLIST ITEM
                  </Mono>
                  <select
                    value={form.wishlist_item_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        wishlist_item_id: e.target.value,
                      }))
                    }
                    className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                  >
                    <option value="">None</option>
                    {wishItems.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.brand} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  NOTES
                </Mono>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent resize-none h-20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setForm(EMPTY_MODAL);
                }}
                className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink-3 hover:text-text-0"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={
                  saving ||
                  !form.item_name.trim() ||
                  !form.brand.trim() ||
                  !form.retailer.trim()
                }
                className="px-4 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
              >
                {saving ? "SAVING…" : "LOG ENTRY"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RaffleRow({
  entry,
  onUpdateResult,
  deadlineClass,
  celebrating,
  highlight,
}: {
  entry: RaffleEntry;
  onUpdateResult: (id: string, result: string) => Promise<void>;
  deadlineClass: string;
  celebrating: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md bg-ink-1 border p-4 transition-all ${
        highlight
          ? "border-[#84f5b8]/40"
          : "border-transparent"
      } ${celebrating ? "animate-pulse ring-2 ring-[#84f5b8]/40" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-0">
            {entry.brand}
          </span>
          <span className="text-sm text-text-1 ml-2">{entry.item_name}</span>
          {entry.size && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3">
              {entry.size}
            </span>
          )}
        </div>
        <div className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
          {entry.retailer}
        </div>
        {entry.deadline && (
          <div
            className={`text-[10px] font-[family-name:var(--font-mono)] ${deadlineClass || "text-ink-3"}`}
          >
            {new Date(entry.deadline).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        <div className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
          {new Date(entry.entry_date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
        </div>

        {/* Result chip — click to cycle */}
        <div className="flex gap-1">
          {(["pending", "won", "lost"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onUpdateResult(entry.id, r)}
              className={`px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] transition-colors ${
                entry.result === r
                  ? ""
                  : "opacity-30 hover:opacity-60"
              }`}
              style={{
                color: RESULT_COLOURS[r],
                backgroundColor: `${RESULT_COLOURS[r]}20`,
                border: `1px solid ${RESULT_COLOURS[r]}40`,
              }}
            >
              {RESULT_LABELS[r]}
            </button>
          ))}
        </div>

        {entry.retail_price != null && (
          <div className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
            £{entry.retail_price}
          </div>
        )}
        {entry.result === "won" && entry.payment_url && (
          <a
            href={entry.payment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-accent hover:text-accent/80"
          >
            PAY NOW →
          </a>
        )}
      </div>
      {entry.notes && (
        <div className="text-[10px] text-ink-3 mt-1 truncate">
          {entry.notes}
        </div>
      )}
    </div>
  );
}

function RaffleField({
  label,
  value,
  onChange,
  type = "text",
  required,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  list?: string;
}) {
  return (
    <div>
      <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
        {label.toUpperCase()}
        {required && <span className="text-accent ml-1">*</span>}
      </Mono>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={list}
        className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
      />
    </div>
  );
}
