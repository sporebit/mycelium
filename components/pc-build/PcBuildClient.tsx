"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { Money } from "@/components/finance/Money";

type PcComponent = {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  specs: string | null;
  purchase_date: string | null;
  price_paid: number | null;
  currency: string;
  date_removed: string | null;
  removal_reason: string | null;
  notes: string | null;
};

const CATEGORIES = [
  "CPU",
  "GPU",
  "RAM",
  "Storage",
  "Motherboard",
  "PSU",
  "Case",
  "Cooling",
  "Display",
  "Peripheral",
  "Other",
] as const;

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  CATEGORIES.map((c, i) => [c, i]),
);

function formatDate(d: string | null): string {
  if (!d) return "—";
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

export function PcBuildClient() {
  const [current, setCurrent] = useState<PcComponent[] | null>(null);
  const [history, setHistory] = useState<PcComponent[] | null>(null);
  const [view, setView] = useState<"current" | "history">("current");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/pc-build").then((r) => r.json()),
      fetch("/api/pc-build?view=history").then((r) => r.json()),
    ])
      .then(([c, h]: [{ components?: PcComponent[] }, { components?: PcComponent[] }]) => {
        if (cancelled) return;
        setCurrent(c.components ?? []);
        setHistory(h.components ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setCurrent([]);
          setHistory([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function addComponent(form: {
    category: string;
    name: string;
    brand: string;
    specs: string;
    purchase_date: string;
    price_paid: string;
  }) {
    try {
      const res = await fetch("/api/pc-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price_paid: form.price_paid ? parseFloat(form.price_paid) : null,
          purchase_date: form.purchase_date || null,
        }),
      });
      if (!res.ok) {
        setError("Failed to add");
        return;
      }
      const { component } = (await res.json()) as { component: PcComponent };
      setCurrent((prev) =>
        prev
          ? [...prev, component].sort(
              (a, b) =>
                (CATEGORY_ORDER[a.category] ?? 99) -
                (CATEGORY_ORDER[b.category] ?? 99),
            )
          : [component],
      );
      setShowAdd(false);
    } catch {
      setError("Network error");
    }
  }

  async function removeComponent(id: string, reason: string) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/pc-build/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_removed: today,
          removal_reason: reason || "upgraded",
        }),
      });
      if (!res.ok) {
        setError("Failed to remove");
        return;
      }
      const { component } = (await res.json()) as { component: PcComponent };
      setCurrent((prev) => prev?.filter((c) => c.id !== id) ?? null);
      setHistory((prev) => (prev ? [component, ...prev] : [component]));
    } catch {
      setError("Network error");
    }
  }

  async function deleteComponent(id: string) {
    try {
      const res = await fetch(`/api/pc-build/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to delete");
        return;
      }
      setHistory((prev) => prev?.filter((c) => c.id !== id) ?? null);
    } catch {
      setError("Network error");
    }
  }

  const totalSpend = current?.reduce((sum, c) => sum + (c.price_paid ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            PC Build
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Current specs and upgrade history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors shrink-0"
        >
          {showAdd ? "CANCEL" : "+ ADD"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {showAdd && <AddForm onSubmit={addComponent} />}

      {/* View tabs */}
      <div className="flex gap-1">
        <TabButton active={view === "current"} onClick={() => setView("current")}>
          CURRENT ({current?.length ?? 0})
        </TabButton>
        <TabButton active={view === "history"} onClick={() => setView("history")}>
          HISTORY ({history?.length ?? 0})
        </TabButton>
      </div>

      {view === "current" && (
        <>
          {totalSpend > 0 && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Total invested:{" "}
              <Mono className="text-ink-4">
                <Money value={totalSpend} currency="GBP" />
              </Mono>
            </div>
          )}
          {current === null ? (
            <Loading />
          ) : current.length === 0 ? (
            <Empty text="No components logged. Tap + ADD to start building." />
          ) : (
            <ComponentList
              components={current}
              onRemove={removeComponent}
            />
          )}
        </>
      )}

      {view === "history" && (
        <>
          {history === null ? (
            <Loading />
          ) : history.length === 0 ? (
            <Empty text="No upgrade history yet." />
          ) : (
            <HistoryList components={history} onDelete={deleteComponent} />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
        active
          ? "bg-accent/15 border border-accent/40 text-accent"
          : "border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
      }`}
    >
      {children}
    </button>
  );
}

function Loading() {
  return (
    <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
      Loading…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-ink-1 p-6 text-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
      {text}
    </div>
  );
}

function ComponentList({
  components,
  onRemove,
}: {
  components: PcComponent[];
  onRemove: (id: string, reason: string) => void;
}) {
  const grouped = new Map<string, PcComponent[]>();
  for (const c of components) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }

  const sorted = [...grouped.entries()].sort(
    ([a], [b]) =>
      (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99),
  );

  return (
    <div className="flex flex-col gap-4">
      {sorted.map(([cat, items]) => (
        <div key={cat}>
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
            {cat}
          </h3>
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <ComponentCard key={c.id} component={c} onRemove={onRemove} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ComponentCard({
  component: c,
  onRemove,
}: {
  component: PcComponent;
  onRemove: (id: string, reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="rounded-md bg-ink-1 border border-ink-2 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-4 font-medium truncate">
            {c.name}
          </span>
          {c.brand && (
            <span className="text-[10px] text-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] shrink-0">
              {c.brand}
            </span>
          )}
        </div>
        {c.specs && (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5 truncate">
            {c.specs}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {c.price_paid != null && (
            <Mono className="text-[10px] text-ink-3">
              <Money value={c.price_paid} currency={c.currency} />
            </Mono>
          )}
          {c.purchase_date && (
            <Mono className="text-[10px] text-ink-3">
              {formatDate(c.purchase_date)}
            </Mono>
          )}
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onRemove(c.id, "upgraded")}
            className="px-2 py-1 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] bg-warn/15 border border-warn/40 text-warn"
          >
            UPGRADED
          </button>
          <button
            type="button"
            onClick={() => onRemove(c.id, "failed")}
            className="px-2 py-1 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] bg-danger/15 border border-danger/40 text-danger"
          >
            FAILED
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-2 py-1 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink-3"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="Mark as removed"
          className="p-1.5 rounded-md text-ink-3 hover:text-warn hover:bg-warn/10 transition-colors shrink-0"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </li>
  );
}

function HistoryList({
  components,
  onDelete,
}: {
  components: PcComponent[];
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {components.map((c) => (
        <li
          key={c.id}
          className="rounded-md bg-ink-1 border border-ink-2 p-3 flex items-center gap-3 opacity-70"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-4 truncate">{c.name}</span>
              <span className="text-[10px] text-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)]">
                {c.category}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {c.date_removed && (
                <Mono className="text-[10px] text-warn">
                  Removed {formatDate(c.date_removed)}
                </Mono>
              )}
              {c.removal_reason && (
                <span className="text-[10px] text-ink-3 italic font-[family-name:var(--font-display)]">
                  ({c.removal_reason})
                </span>
              )}
            </div>
            {c.specs && (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5 truncate">
                {c.specs}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDelete(c.id)}
            title="Delete permanently"
            className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddForm({
  onSubmit,
}: {
  onSubmit: (f: {
    category: string;
    name: string;
    brand: string;
    specs: string;
    purchase_date: string;
    price_paid: string;
  }) => void;
}) {
  const [category, setCategory] = useState("GPU");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [specs, setSpecs] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [pricePaid, setPricePaid] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      category,
      name,
      brand,
      specs,
      purchase_date: purchaseDate,
      price_paid: pricePaid,
    });
  }

  const inputClass =
    "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
  const labelClass =
    "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md bg-ink-1 border border-ink-2 p-4 flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="RTX 4080 Super"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Brand</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="NVIDIA"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Specs</label>
          <input
            type="text"
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            placeholder="16GB GDDR6X"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Purchase date</label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Price paid (£)</label>
          <input
            type="number"
            step="0.01"
            value={pricePaid}
            onChange={(e) => setPricePaid(e.target.value)}
            placeholder="899.99"
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={!name.trim()}
        className="self-start px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
      >
        ADD COMPONENT
      </button>
    </form>
  );
}
