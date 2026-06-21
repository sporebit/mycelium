"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type Drop = {
  id: string;
  name: string;
  brand: string;
  category: string | null;
  drop_type: string;
  drop_date: string | null;
  drop_date_confirmed: boolean;
  retail_price: number | null;
  resale_price: number | null;
  currency: string;
  status: string;
  image_url: string | null;
  product_url: string | null;
  notes: string | null;
  region: string;
};

type ModalState = {
  name: string;
  brand: string;
  category: string;
  drop_type: string;
  drop_date: string;
  drop_date_confirmed: boolean;
  retail_price: string;
  resale_price: string;
  region: string;
  product_url: string;
  image_url: string;
  notes: string;
};

const EMPTY_MODAL: ModalState = {
  name: "",
  brand: "",
  category: "",
  drop_type: "drop",
  drop_date: "",
  drop_date_confirmed: false,
  retail_price: "",
  resale_price: "",
  region: "UK",
  product_url: "",
  image_url: "",
  notes: "",
};

const CATEGORIES = [
  "tee", "hoodie", "jacket", "pants", "shorts",
  "accessory", "footwear", "collab", "bag", "hat", "other",
];

const DROP_TYPES = ["drop", "raffle", "restock", "collab", "exclusive"];

const TYPE_COLOURS: Record<string, string> = {
  drop: "#84f5b8",
  raffle: "#6db8f5",
  restock: "#f5b56d",
  collab: "#f56db5",
  exclusive: "#f56db5",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "UPCOMING",
  live: "LIVE",
  ended: "ENDED",
  restocked: "RESTOCKED",
};

function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CalendarPage() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalState>(EMPTY_MODAL);
  const [saving, setSaving] = useState(false);

  const fetchDrops = useCallback(async () => {
    try {
      const r = await fetch("/api/drops");
      if (r.ok) {
        const j = await r.json();
        setDrops(j.drops);
        setBrands(j.brands);
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
      await fetchDrops();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchDrops]);

  const weekDays = getWeekDays(weekAnchor);

  const filtered = drops.filter((d) => {
    if (filterType !== "all" && d.drop_type !== filterType) return false;
    if (filterBrand !== "all" && d.brand !== filterBrand) return false;
    return true;
  });

  const live = filtered.filter((d) => d.status === "live");
  const rest = filtered.filter((d) => d.status !== "live");

  const grouped: Record<string, Drop[]> = {};
  for (const d of rest) {
    const key = d.drop_date ? isoDay(new Date(d.drop_date)) : "TBC";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    if (a === "TBC") return 1;
    if (b === "TBC") return -1;
    return a.localeCompare(b);
  });

  async function handleCreate() {
    if (!form.name.trim() || !form.brand.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        brand: form.brand,
        category: form.category || null,
        drop_type: form.drop_type,
        drop_date: form.drop_date || null,
        drop_date_confirmed: form.drop_date_confirmed,
        retail_price: form.retail_price ? Number(form.retail_price) : null,
        resale_price: form.resale_price ? Number(form.resale_price) : null,
        region: form.region,
        product_url: form.product_url || null,
        image_url: form.image_url || null,
        notes: form.notes || null,
      };
      const r = await fetch("/api/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setShowModal(false);
        setForm(EMPTY_MODAL);
        await fetchDrops();
      }
    } finally {
      setSaving(false);
    }
  }

  function shiftWeek(dir: number) {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Drops
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          ADD DROP
        </button>
      </header>

      {/* Week strip */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="text-ink-3 hover:text-text-0 text-sm px-1"
        >
          ←
        </button>
        <div className="flex gap-1 flex-1">
          {weekDays.map((d) => {
            const iso = isoDay(d);
            const isToday = iso === isoDay(new Date());
            const hasDrops = drops.some(
              (dr) => dr.drop_date && isoDay(new Date(dr.drop_date)) === iso,
            );
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setWeekAnchor(d)}
                className={`flex-1 py-2 rounded-md text-center transition-colors ${
                  isToday
                    ? "bg-accent/20 border border-accent/40 text-accent"
                    : "bg-ink-1 border border-transparent text-ink-3 hover:text-text-0"
                }`}
              >
                <div className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em]">
                  {d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
                </div>
                <div className="text-sm">{d.getDate()}</div>
                {hasDrops && (
                  <div className="w-1 h-1 rounded-full bg-accent mx-auto mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="text-ink-3 hover:text-text-0 text-sm px-1"
        >
          →
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", ...DROP_TYPES].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              filterType === t
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {t === "all" ? "All" : t}
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
          Loading drops…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No drops yet. Add one to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Live now */}
          {live.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#84f5b8] animate-pulse" />
                <Mono className="text-[11px] text-[#84f5b8] tracking-[0.18em]">
                  LIVE NOW
                </Mono>
              </div>
              <div className="flex flex-col gap-2">
                {live.map((d) => (
                  <DropCard key={d.id} drop={d} onRefresh={fetchDrops} />
                ))}
              </div>
            </div>
          )}

          {/* Grouped by date */}
          {sortedDates.map((date) => (
            <div key={date}>
              <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-2 block">
                {date === "TBC"
                  ? "DATE TBC"
                  : new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
              </Mono>
              <div className="flex flex-col gap-2">
                {grouped[date].map((d) => (
                  <DropCard key={d.id} drop={d} onRefresh={fetchDrops} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Drop modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0 mb-4">
              Add Drop
            </h2>
            <div className="flex flex-col gap-3">
              <Field
                label="Name"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
              />
              <Field
                label="Brand"
                value={form.brand}
                onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
                required
                list="brand-list"
              />
              <datalist id="brand-list">
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <SelectField
                label="Category"
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                options={["", ...CATEGORIES]}
              />
              <SelectField
                label="Drop type"
                value={form.drop_type}
                onChange={(v) => setForm((f) => ({ ...f, drop_type: v }))}
                options={DROP_TYPES}
              />
              <Field
                label="Drop date & time"
                value={form.drop_date}
                onChange={(v) => setForm((f) => ({ ...f, drop_date: v }))}
                type="datetime-local"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.drop_date_confirmed}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      drop_date_confirmed: e.target.checked,
                    }))
                  }
                  className="accent-accent"
                />
                <span className="text-xs text-text-1">Date confirmed?</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Retail price"
                  value={form.retail_price}
                  onChange={(v) => setForm((f) => ({ ...f, retail_price: v }))}
                  type="number"
                />
                <Field
                  label="Resale estimate"
                  value={form.resale_price}
                  onChange={(v) => setForm((f) => ({ ...f, resale_price: v }))}
                  type="number"
                />
              </div>
              <SelectField
                label="Region"
                value={form.region}
                onChange={(v) => setForm((f) => ({ ...f, region: v }))}
                options={["UK", "EU", "US", "Global"]}
              />
              <Field
                label="Product URL"
                value={form.product_url}
                onChange={(v) => setForm((f) => ({ ...f, product_url: v }))}
              />
              <Field
                label="Image URL"
                value={form.image_url}
                onChange={(v) => setForm((f) => ({ ...f, image_url: v }))}
              />
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
                {saving ? "SAVING…" : "ADD DROP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DropCard({
  drop,
  onRefresh,
}: {
  drop: Drop;
  onRefresh: () => Promise<void>;
}) {
  const colour = TYPE_COLOURS[drop.drop_type] ?? "#e8e6dd";
  const isLive = drop.status === "live";

  async function quickAction(action: string) {
    if (action === "wishlist") {
      await fetch("/api/drops/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drop_id: drop.id,
          name: drop.name,
          brand: drop.brand,
          category: drop.category,
          retail_price: drop.retail_price,
          resale_price: drop.resale_price,
          image_url: drop.image_url,
          product_url: drop.product_url,
        }),
      });
    } else if (action === "raffle") {
      await fetch("/api/drops/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drop_id: drop.id,
          item_name: drop.name,
          brand: drop.brand,
          retailer: "TBC",
          retail_price: drop.retail_price,
        }),
      });
    }
    await onRefresh();
  }

  return (
    <div
      className={`rounded-md bg-ink-1 border p-4 flex gap-4 ${
        isLive ? "border-[#84f5b8]/40" : "border-transparent"
      }`}
    >
      {drop.image_url && (
        <div className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0 bg-ink-2">
          <img
            src={drop.image_url}
            alt={drop.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium text-text-0">{drop.brand}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] uppercase"
            style={{
              color: colour,
              backgroundColor: `${colour}20`,
              border: `1px solid ${colour}40`,
            }}
          >
            {drop.drop_type}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] bg-ink-2 text-ink-3">
            {drop.region}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#84f5b8]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#84f5b8] animate-pulse" />
              LIVE
            </span>
          )}
          {!isLive && (
            <Mono className="text-[8px] text-ink-3 tracking-[0.1em]">
              {STATUS_LABELS[drop.status] ?? drop.status.toUpperCase()}
            </Mono>
          )}
        </div>
        <div className="text-sm text-text-1">{drop.name}</div>
        <div className="flex items-center gap-3 mt-1 text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
          {drop.drop_date ? (
            <span>
              {drop.drop_date_confirmed ? "" : "~"}
              {formatDate(drop.drop_date)}
            </span>
          ) : (
            <span>Date TBC</span>
          )}
          {drop.retail_price != null && <span>£{drop.retail_price}</span>}
          {drop.resale_price != null && (
            <span className="text-ink-4">
              Resale ~£{drop.resale_price}
            </span>
          )}
        </div>
        {drop.notes && (
          <div className="text-[10px] text-ink-3 mt-1 truncate">
            {drop.notes}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => quickAction("wishlist")}
            className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-accent hover:text-accent/80 transition-colors"
          >
            + WISHLIST
          </button>
          <button
            type="button"
            onClick={() => quickAction("raffle")}
            className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#6db8f5] hover:text-[#6db8f5]/80 transition-colors"
          >
            + RAFFLE
          </button>
          {drop.product_url && (
            <a
              href={drop.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink-3 hover:text-text-0 transition-colors"
            >
              OPEN →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
        {label.toUpperCase()}
      </Mono>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}
