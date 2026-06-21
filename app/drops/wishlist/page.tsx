"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type WishlistItem = {
  id: string;
  drop_id: string | null;
  name: string;
  brand: string;
  category: string | null;
  colourway: string | null;
  size: string | null;
  status: string;
  retail_price: number | null;
  resale_price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  stockx_url: string | null;
  grailed_url: string | null;
  notes: string | null;
  drops?: { brand: string; name: string; drop_type: string } | null;
};

type ModalState = {
  name: string;
  brand: string;
  category: string;
  colourway: string;
  size: string;
  status: string;
  retail_price: string;
  resale_price: string;
  product_url: string;
  image_url: string;
  drop_id: string;
  notes: string;
};

const EMPTY_MODAL: ModalState = {
  name: "",
  brand: "",
  category: "",
  colourway: "",
  size: "",
  status: "want",
  retail_price: "",
  resale_price: "",
  product_url: "",
  image_url: "",
  drop_id: "",
  notes: "",
};

const STATUS_COLOURS: Record<string, string> = {
  want: "#84f5b8",
  got_it: "#e8e6dd",
  missed_it: "#f56d6d",
  watching: "#f5b56d",
  passed: "#555",
};

const STATUS_LABELS: Record<string, string> = {
  want: "WANT",
  got_it: "GOT IT",
  missed_it: "MISSED IT",
  watching: "WATCHING",
  passed: "PASSED",
};

const STATUSES = ["want", "got_it", "missed_it", "watching", "passed"];

type Drop = { id: string; name: string; brand: string };

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalState>(EMPTY_MODAL);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, dRes] = await Promise.all([
        fetch("/api/drops/wishlist"),
        fetch("/api/drops"),
      ]);
      if (wRes.ok) {
        const j = await wRes.json();
        setItems(j.items);
        setBrands(j.brands);
      }
      if (dRes.ok) {
        const j = await dRes.json();
        setDrops(
          (j.drops as Drop[]).filter(
            (d: Record<string, unknown>) => d.status === "upcoming" || d.status === "live",
          ),
        );
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

  const filtered = items.filter((i) => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterBrand !== "all" && i.brand !== filterBrand) return false;
    return true;
  });

  const stats = {
    want: items.filter((i) => i.status === "want").length,
    got: items.filter((i) => i.status === "got_it").length,
    missed: items.filter((i) => i.status === "missed_it").length,
    total: items.length,
  };
  const hitRate =
    stats.got + stats.missed > 0
      ? Math.round((stats.got / (stats.got + stats.missed)) * 100)
      : 0;

  async function handleCreate() {
    if (!form.name.trim() || !form.brand.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/drops/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand,
          category: form.category || null,
          colourway: form.colourway || null,
          size: form.size || null,
          status: form.status,
          retail_price: form.retail_price ? Number(form.retail_price) : null,
          resale_price: form.resale_price ? Number(form.resale_price) : null,
          product_url: form.product_url || null,
          image_url: form.image_url || null,
          drop_id: form.drop_id || null,
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

  async function quickStatus(id: string, status: string) {
    await fetch(`/api/drops/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchData();
  }

  function searchUrl(base: string, item: WishlistItem): string {
    return `${base}${encodeURIComponent(item.brand + " " + item.name)}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Wishlist
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          ADD ITEM
        </button>
      </header>

      {/* Stats bar */}
      <div className="flex gap-4 text-[10px] font-[family-name:var(--font-mono)] text-ink-3 tracking-[0.1em]">
        <span>
          <span className="text-text-0">{stats.want}</span> wanted
        </span>
        <span>
          <span className="text-text-0">{stats.got}</span> got
        </span>
        <span>
          <span className="text-text-0">{stats.missed}</span> missed
        </span>
        <span>
          Hit rate:{" "}
          <span className="text-accent">{hitRate}%</span>
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              filterStatus === s
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s] ?? s}
          </button>
        ))}
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="bg-ink-1 border border-ink-2 rounded-md text-[10px] font-[family-name:var(--font-mono)] text-ink-3 px-2 py-1 outline-none"
        >
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading wishlist…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No items yet. Add one to start tracking.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const sCol = STATUS_COLOURS[item.status] ?? "#555";
            const delta =
              item.retail_price != null && item.resale_price != null
                ? item.resale_price - item.retail_price
                : null;
            return (
              <div
                key={item.id}
                className={`rounded-md bg-ink-1 border overflow-hidden ${
                  item.status === "passed"
                    ? "border-ink-2 opacity-50"
                    : "border-transparent"
                }`}
              >
                {item.image_url ? (
                  <div className="h-48 overflow-hidden bg-ink-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="h-48 flex items-center justify-center text-4xl font-[family-name:var(--font-display)] italic"
                    style={{ color: sCol, backgroundColor: `${sCol}10` }}
                  >
                    {item.brand.charAt(0)}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-0">
                      {item.brand}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em]"
                      style={{
                        color: sCol,
                        backgroundColor: `${sCol}20`,
                        border: `1px solid ${sCol}40`,
                      }}
                    >
                      {STATUS_LABELS[item.status] ?? item.status.toUpperCase()}
                      {item.status === "got_it" && " ✓"}
                    </span>
                    {!!item.drops && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3">
                        DROP
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-1">{item.name}</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {item.colourway && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3">
                        {item.colourway}
                      </span>
                    )}
                    {item.size && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3">
                        {item.size}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
                    {item.retail_price != null && (
                      <span>£{item.retail_price}</span>
                    )}
                    {item.resale_price != null && (
                      <span>Resale £{item.resale_price}</span>
                    )}
                    {delta != null && (
                      <span
                        className={
                          delta > 0 ? "text-[#84f5b8]" : "text-[#f56d6d]"
                        }
                      >
                        {delta > 0 ? "+" : ""}£{delta}
                      </span>
                    )}
                  </div>

                  {/* Links */}
                  <div className="flex gap-2 mt-2">
                    {item.product_url && (
                      <a
                        href={item.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-[family-name:var(--font-mono)] text-ink-3 hover:text-text-0"
                        title="Product"
                      >
                        LINK
                      </a>
                    )}
                    <a
                      href={searchUrl(
                        "https://stockx.com/search?s=",
                        item,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-[family-name:var(--font-mono)] text-ink-3 hover:text-text-0"
                    >
                      STOCKX
                    </a>
                    <a
                      href={searchUrl(
                        "https://www.grailed.com/shop?query=",
                        item,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-[family-name:var(--font-mono)] text-ink-3 hover:text-text-0"
                    >
                      GRAILED
                    </a>
                    <a
                      href={searchUrl(
                        "https://www.ebay.co.uk/sch/i.html?_nkw=",
                        item,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-[family-name:var(--font-mono)] text-ink-3 hover:text-text-0"
                    >
                      EBAY
                    </a>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 mt-3 border-t border-ink-2 pt-3">
                    {item.status !== "got_it" && (
                      <button
                        type="button"
                        onClick={() => quickStatus(item.id, "got_it")}
                        className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#84f5b8] hover:text-[#84f5b8]/80"
                      >
                        GOT IT
                      </button>
                    )}
                    {item.status !== "missed_it" && (
                      <button
                        type="button"
                        onClick={() => quickStatus(item.id, "missed_it")}
                        className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#f56d6d] hover:text-[#f56d6d]/80"
                      >
                        MISSED IT
                      </button>
                    )}
                    {item.status !== "watching" && item.status !== "got_it" && (
                      <button
                        type="button"
                        onClick={() => quickStatus(item.id, "watching")}
                        className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#f5b56d] hover:text-[#f5b56d]/80"
                      >
                        WATCH
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Item modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0 mb-4">
              Add Wishlist Item
            </h2>
            <div className="flex flex-col gap-3">
              <ModalField
                label="Name"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
              />
              <ModalField
                label="Brand"
                value={form.brand}
                onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
                required
              />
              <div className="grid grid-cols-3 gap-3">
                <ModalField
                  label="Category"
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                />
                <ModalField
                  label="Colourway"
                  value={form.colourway}
                  onChange={(v) => setForm((f) => ({ ...f, colourway: v }))}
                />
                <ModalField
                  label="Size"
                  value={form.size}
                  onChange={(v) => setForm((f) => ({ ...f, size: v }))}
                />
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  STATUS
                </Mono>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ModalField
                  label="Retail price"
                  value={form.retail_price}
                  onChange={(v) => setForm((f) => ({ ...f, retail_price: v }))}
                  type="number"
                />
                <ModalField
                  label="Resale estimate"
                  value={form.resale_price}
                  onChange={(v) => setForm((f) => ({ ...f, resale_price: v }))}
                  type="number"
                />
              </div>
              <ModalField
                label="Product URL"
                value={form.product_url}
                onChange={(v) => setForm((f) => ({ ...f, product_url: v }))}
              />
              <ModalField
                label="Image URL"
                value={form.image_url}
                onChange={(v) => setForm((f) => ({ ...f, image_url: v }))}
              />
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
                disabled={saving || !form.name.trim() || !form.brand.trim()}
                className="px-4 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
              >
                {saving ? "SAVING…" : "ADD ITEM"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
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
        className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
      />
    </div>
  );
}
