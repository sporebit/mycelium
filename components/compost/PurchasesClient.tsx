"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type { Project } from "@/lib/types/project";
import {
  PURCHASE_URGENCIES,
  currencySymbol,
  type Purchase,
  type PurchaseListType,
  type PurchaseUrgency,
  type PurchaseWantOrNeed,
} from "@/lib/types/purchase";

type Filter = "all" | "want" | "need" | "today" | "this_week";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "want", label: "WANT" },
  { value: "need", label: "NEED" },
  { value: "today", label: "TODAY" },
  { value: "this_week", label: "THIS WEEK" },
];

const URGENCY_TONE: Record<PurchaseUrgency, string> = {
  today: "bg-danger/15 text-danger border-danger/40",
  this_week: "bg-warn/15 text-warn border-warn/40",
  this_month: "bg-accent/15 text-accent border-accent/40",
  someday: "bg-ink-2 text-ink-3 border-ink-2",
};

const URGENCY_LABEL: Record<PurchaseUrgency, string> = {
  today: "TODAY",
  this_week: "THIS WEEK",
  this_month: "THIS MONTH",
  someday: "SOMEDAY",
};

function wantOrNeedTone(v: PurchaseWantOrNeed | null): string {
  if (v === "need") return "bg-danger/15 text-danger border-danger/40";
  if (v === "want") return "bg-accent/15 text-accent border-accent/40";
  return "bg-ink-2 text-ink-3 border-ink-2";
}

function wantOrNeedLabel(v: PurchaseWantOrNeed | null): string {
  if (v === "need") return "NEED";
  if (v === "want") return "WANT";
  return "?";
}

function fmtAmount(p: Purchase): string | null {
  if (p.amount === null || p.amount === undefined) return null;
  return `~${currencySymbol(p.currency)}${
    Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2)
  }`;
}

function within30Days(iso: string): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 30 * 24 * 60 * 60_000;
}

type Toast = { kind: "ok" | "error"; text: string } | null;

export function PurchasesClient({
  initialProjectId,
}: {
  /** When set, the page filters to a single project. Used by the
   *  project-detail purchases-page link. */
  initialProjectId?: string;
} = {}) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [draftListType, setDraftListType] =
    useState<PurchaseListType>("shopping");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    let cancelled = false;
    const url = initialProjectId
      ? `/api/purchases?project_id=${encodeURIComponent(initialProjectId)}`
      : "/api/purchases";
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { purchases?: Purchase[] }) => {
        if (cancelled) return;
        setPurchases(Array.isArray(j?.purchases) ? j.purchases : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPurchases([]);
      });
    fetch("/api/projects?status=active")
      .then((r) => r.json())
      .then((j: { projects?: Project[] }) => {
        if (cancelled) return;
        setProjects(Array.isArray(j?.projects) ? j.projects : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialProjectId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  async function addPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          list_type: draftListType,
          project_id: initialProjectId ?? null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        purchase?: Purchase;
        error?: string;
      };
      if (!res.ok || !j.purchase) {
        showToast("error", j.error ?? "Add failed");
        return;
      }
      setPurchases((cur) => [j.purchase!, ...(cur ?? [])]);
      setDraft("");
    } finally {
      setAdding(false);
    }
  }

  async function patchPurchase(id: string, patch: Partial<Purchase>) {
    if (busyId) return;
    setBusyId(id);
    const prev = purchases ?? [];
    setPurchases((cur) =>
      (cur ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as {
        purchase?: Purchase;
        error?: string;
      };
      if (!res.ok || !j.purchase) {
        setPurchases(prev);
        showToast("error", j.error ?? "Update failed");
        return;
      }
      setPurchases((cur) =>
        (cur ?? []).map((p) => (p.id === id ? j.purchase! : p)),
      );
    } catch {
      setPurchases(prev);
      showToast("error", "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePurchase(id: string) {
    if (busyId) return;
    if (!window.confirm("Delete this purchase? This can't be undone.")) return;
    setBusyId(id);
    const prev = purchases ?? [];
    setPurchases((cur) => (cur ?? []).filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setPurchases(prev);
        showToast("error", "Delete failed");
      }
    } catch {
      setPurchases(prev);
      showToast("error", "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function togglePurchased(p: Purchase) {
    void patchPurchase(p.id, {
      completed_at: p.completed_at ? null : new Date().toISOString(),
    });
  }

  const { shopping, wishlist, purchased } = useMemo(() => {
    const shoppingList: Purchase[] = [];
    const wishlistList: Purchase[] = [];
    const purchasedList: Purchase[] = [];
    for (const p of purchases ?? []) {
      // Wishlist captures everything tagged as wishlist regardless of
      // completion state — it's a long-running list, not a queue.
      if (p.list_type === "wishlist") {
        wishlistList.push(p);
        continue;
      }
      // Shopping: pending goes to shopping, completed within 30d goes
      // to purchased.
      if (p.completed_at) {
        if (within30Days(p.completed_at)) purchasedList.push(p);
      } else {
        shoppingList.push(p);
      }
    }
    purchasedList.sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
    );
    return {
      shopping: shoppingList,
      wishlist: wishlistList,
      purchased: purchasedList,
    };
  }, [purchases]);

  function applyFilter(list: Purchase[]): Purchase[] {
    if (filter === "all") return list;
    if (filter === "want") {
      return list.filter((p) => p.want_or_need === "want");
    }
    if (filter === "need") {
      return list.filter((p) => p.want_or_need === "need");
    }
    return list.filter((p) => p.urgency === filter);
  }

  const visibleShopping = applyFilter(shopping);
  const visibleWishlist = applyFilter(wishlist);

  const projectName = initialProjectId
    ? (purchases ?? []).find((p) => p.project_id === initialProjectId)
        ?.project_name ??
      projects.find((p) => p.id === initialProjectId)?.name ??
      null
    : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          {projectName ? `Purchases · ${projectName}` : "Purchases"}
        </h1>
        {purchases !== null && (
          <Mono className="text-[10px] text-ink-3">
            {shopping.length} SHOPPING · {wishlist.length} WISHLIST ·{" "}
            {purchased.length} PURCHASED
          </Mono>
        )}
      </header>

      {initialProjectId && (
        <Link
          href="/compost/purchases"
          className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] inline-flex items-center gap-1 self-start"
        >
          ← All purchases
        </Link>
      )}

      <form
        onSubmit={addPurchase}
        className="flex flex-wrap items-center gap-2 bg-ink-1 rounded-md px-3 py-2"
      >
        <span aria-hidden className="text-accent text-sm">
          🛍
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={adding}
          placeholder={
            draftListType === "wishlist"
              ? "Add to wishlist (e.g. Sony XM5, leather jacket)"
              : "Add a purchase (e.g. milk, batteries, keyboard)"
          }
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
        />
        <ListTypeToggle value={draftListType} onChange={setDraftListType} />
        <button
          type="submit"
          disabled={!draft.trim() || adding}
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
        >
          {adding ? "…" : "ADD ↵"}
        </button>
      </form>

      <div className="flex items-center gap-1 rounded-md border border-ink-2 overflow-hidden self-start">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {purchases === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading purchases…
        </div>
      ) : (
        <>
          <Section
            heading="Shopping"
            visible={visibleShopping}
            sectionTotal={shopping.length}
            emptyAll="Nothing to buy. Voice &ldquo;buy X&rdquo; to add."
            emptyFiltered="No shopping items match this filter."
            rows={visibleShopping}
            projects={projects}
            busyId={busyId}
            onToggle={togglePurchased}
            onChangeWantOrNeed={(p, v) =>
              void patchPurchase(p.id, { want_or_need: v })
            }
            onChangeUrgency={(p, v) =>
              void patchPurchase(p.id, { urgency: v })
            }
            onChangeProject={(p, v) =>
              void patchPurchase(p.id, { project_id: v })
            }
            onChangeListType={(p, v) =>
              void patchPurchase(p.id, { list_type: v })
            }
            onDelete={(p) => void deletePurchase(p.id)}
          />

          <Section
            heading="Wishlist"
            visible={visibleWishlist}
            sectionTotal={wishlist.length}
            emptyAll="No wishlist items yet. Toggle the add box to WISHLIST to start one."
            emptyFiltered="No wishlist items match this filter."
            rows={visibleWishlist}
            projects={projects}
            busyId={busyId}
            onToggle={togglePurchased}
            onChangeWantOrNeed={(p, v) =>
              void patchPurchase(p.id, { want_or_need: v })
            }
            onChangeUrgency={(p, v) =>
              void patchPurchase(p.id, { urgency: v })
            }
            onChangeProject={(p, v) =>
              void patchPurchase(p.id, { project_id: v })
            }
            onChangeListType={(p, v) =>
              void patchPurchase(p.id, { list_type: v })
            }
            onDelete={(p) => void deletePurchase(p.id)}
          />

          {purchased.length > 0 && (
            <Section
              heading="Purchased · last 30 days"
              visible={purchased}
              sectionTotal={purchased.length}
              emptyAll=""
              emptyFiltered=""
              rows={purchased}
              projects={projects}
              busyId={busyId}
              onToggle={togglePurchased}
              onChangeWantOrNeed={(p, v) =>
                void patchPurchase(p.id, { want_or_need: v })
              }
              onChangeUrgency={(p, v) =>
                void patchPurchase(p.id, { urgency: v })
              }
              onChangeProject={(p, v) =>
                void patchPurchase(p.id, { project_id: v })
              }
              onChangeListType={(p, v) =>
                void patchPurchase(p.id, { list_type: v })
              }
              onDelete={(p) => void deletePurchase(p.id)}
            />
          )}
        </>
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

function ListTypeToggle({
  value,
  onChange,
}: {
  value: PurchaseListType;
  onChange: (next: PurchaseListType) => void;
}) {
  return (
    <div className="inline-flex rounded-sm border border-ink-2 overflow-hidden text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em]">
      {(["shopping", "wishlist"] as const).map((v) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2 py-1 transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
            }`}
          >
            {v === "shopping" ? "SHOPPING" : "WISHLIST"}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  heading,
  visible,
  sectionTotal,
  emptyAll,
  emptyFiltered,
  rows,
  projects,
  busyId,
  onToggle,
  onChangeWantOrNeed,
  onChangeUrgency,
  onChangeProject,
  onChangeListType,
  onDelete,
}: {
  heading: string;
  visible: Purchase[];
  sectionTotal: number;
  emptyAll: string;
  emptyFiltered: string;
  rows: Purchase[];
  projects: Project[];
  busyId: string | null;
  onToggle: (p: Purchase) => void;
  onChangeWantOrNeed: (p: Purchase, v: PurchaseWantOrNeed) => void;
  onChangeUrgency: (p: Purchase, v: PurchaseUrgency) => void;
  onChangeProject: (p: Purchase, v: string | null) => void;
  onChangeListType: (p: Purchase, v: PurchaseListType) => void;
  onDelete: (p: Purchase) => void;
}) {
  if (sectionTotal === 0 && !emptyAll) return null;
  return (
    <section className="flex flex-col gap-2 mt-2 first:mt-0">
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {heading}
        {sectionTotal > 0 && ` (${sectionTotal})`}
      </h2>
      {sectionTotal === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p
            className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]"
            dangerouslySetInnerHTML={{ __html: emptyAll }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-6 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {emptyFiltered}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <PurchaseRow
              key={p.id}
              purchase={p}
              projects={projects}
              busy={busyId === p.id}
              onToggle={() => onToggle(p)}
              onChangeWantOrNeed={(v) => onChangeWantOrNeed(p, v)}
              onChangeUrgency={(v) => onChangeUrgency(p, v)}
              onChangeProject={(v) => onChangeProject(p, v)}
              onChangeListType={(v) => onChangeListType(p, v)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PurchaseRow({
  purchase,
  projects,
  busy,
  onToggle,
  onChangeWantOrNeed,
  onChangeUrgency,
  onChangeProject,
  onChangeListType,
  onDelete,
}: {
  purchase: Purchase;
  projects: Project[];
  busy: boolean;
  onToggle: () => void;
  onChangeWantOrNeed: (v: PurchaseWantOrNeed) => void;
  onChangeUrgency: (v: PurchaseUrgency) => void;
  onChangeProject: (v: string | null) => void;
  onChangeListType: (v: PurchaseListType) => void;
  onDelete: () => void;
}) {
  const purchased = !!purchase.completed_at;
  const amount = fmtAmount(purchase);
  return (
    <li
      className={`group flex flex-wrap items-center gap-2 sm:gap-3 bg-ink-1 rounded-md px-3 py-2.5 ${
        purchased ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={purchased ? "Mark as not purchased" : "Mark as purchased"}
        className={`h-5 w-5 shrink-0 rounded-sm border flex items-center justify-center text-[11px] leading-none transition-colors ${
          purchased
            ? "border-ok bg-ok text-ink-0"
            : "border-ink-3 hover:border-accent"
        }`}
      >
        {purchased ? "✓" : ""}
      </button>

      <button
        type="button"
        onClick={() => {
          const next: PurchaseWantOrNeed =
            purchase.want_or_need === "need"
              ? "want"
              : purchase.want_or_need === "want"
                ? "unclear"
                : "need";
          onChangeWantOrNeed(next);
        }}
        disabled={busy}
        title="Click to cycle want/need/?"
        className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 transition-colors ${wantOrNeedTone(purchase.want_or_need)}`}
      >
        {wantOrNeedLabel(purchase.want_or_need)}
      </button>

      <div className="flex-1 min-w-[120px]">
        <div
          className={`text-sm leading-snug truncate ${
            purchased ? "text-ink-3 line-through" : "text-text-0"
          }`}
        >
          {purchase.title}
        </div>
      </div>

      {purchase.project_id && purchase.project_name && (
        <Link
          href={`/compost/projects/${purchase.project_id}`}
          className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/10 text-accent shrink-0 max-w-[140px] truncate"
          onClick={(e) => e.stopPropagation()}
        >
          ◆ {purchase.project_name}
        </Link>
      )}

      {amount && (
        <Mono className="text-[11px] text-ink-3 shrink-0 tabular-nums">
          {amount}
        </Mono>
      )}

      <select
        value={purchase.project_id ?? ""}
        onChange={(e) => onChangeProject(e.target.value || null)}
        disabled={busy}
        className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 bg-ink-0/40 border-ink-2 text-ink-3 cursor-pointer max-w-[120px]"
        title="Project"
      >
        <option value="">— PROJECT —</option>
        {projects.map((proj) => (
          <option key={proj.id} value={proj.id}>
            {proj.name}
          </option>
        ))}
        {/* Show currently-linked project even if archived/completed */}
        {purchase.project_id &&
          !projects.some((p) => p.id === purchase.project_id) &&
          purchase.project_name && (
            <option value={purchase.project_id}>
              {purchase.project_name}
            </option>
          )}
      </select>

      <select
        value={purchase.list_type}
        onChange={(e) =>
          onChangeListType(e.target.value as PurchaseListType)
        }
        disabled={busy}
        className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 bg-ink-0/40 border-ink-2 text-ink-3 cursor-pointer"
        title="List"
      >
        <option value="shopping">SHOPPING</option>
        <option value="wishlist">WISHLIST</option>
      </select>

      <select
        value={purchase.urgency}
        onChange={(e) => onChangeUrgency(e.target.value as PurchaseUrgency)}
        disabled={busy}
        className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 cursor-pointer ${URGENCY_TONE[purchase.urgency]}`}
        title="Urgency"
      >
        {PURCHASE_URGENCIES.map((u) => (
          <option key={u} value={u}>
            {URGENCY_LABEL[u]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete"
        className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger transition-opacity text-sm shrink-0"
      >
        ×
      </button>
    </li>
  );
}
