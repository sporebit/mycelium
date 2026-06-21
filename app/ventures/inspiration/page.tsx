"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type Inspiration = {
  id: string;
  company_name: string;
  website_url: string | null;
  category: string | null;
  what_i_like: string;
  image_url: string | null;
  tags: string[];
  created_at: string;
};

const CATEGORIES = [
  "business_model",
  "customer_service",
  "product",
  "branding",
  "marketing",
  "workflow",
  "pricing",
  "other",
] as const;

const CATEGORY_COLOURS: Record<string, string> = {
  business_model: "bg-info/20 text-info",
  customer_service: "bg-ok/20 text-ok",
  product: "bg-warn/20 text-warn",
  branding: "bg-[#f56db5]/20 text-[#f56db5]",
  marketing: "bg-accent/20 text-accent",
  workflow: "bg-[#6db8f5]/20 text-[#6db8f5]",
  pricing: "bg-[#f5b56d]/20 text-[#f5b56d]",
  other: "bg-ink-3/20 text-ink-3",
};

function categoryLabel(cat: string): string {
  return cat.replace(/_/g, " ");
}

export default function InspirationPage() {
  const [items, setItems] = useState<Inspiration[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagSearch, setTagSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Inspiration | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/ventures/inspiration", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.items ?? []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/ventures/inspiration", { cache: "no-store" });
        if (cancelled) return;
        if (!r.ok) { setItems([]); return; }
        const j = await r.json();
        if (!cancelled) setItems(j.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (categoryFilter !== "all") {
      list = list.filter((i) => i.category === categoryFilter);
    }
    if (tagSearch.trim()) {
      const q = tagSearch.toLowerCase();
      list = list.filter(
        (i) =>
          (i.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          i.company_name.toLowerCase().includes(q) ||
          i.what_i_like.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, categoryFilter, tagSearch]);

  async function deleteItem(id: string) {
    await fetch(`/api/ventures/inspiration/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Inspiration
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Companies and ideas worth stealing from.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 transition-colors text-xs font-medium font-[family-name:var(--font-mono)] tracking-[0.1em]"
        >
          + ADD
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {["all", ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryFilter(c)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              categoryFilter === c
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {c === "all" ? "ALL" : categoryLabel(c)}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={tagSearch}
        onChange={(e) => setTagSearch(e.target.value)}
        placeholder="Search by tag, company, or content…"
        className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3 max-w-sm"
      />

      {items === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          {items.length === 0
            ? "No inspiration yet. Add your first above."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="break-inside-avoid rounded-md bg-ink-1 p-4 group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-[family-name:var(--font-display)] text-lg text-text-0">
                    {item.company_name}
                  </div>
                  {item.website_url && (
                    <a
                      href={item.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-accent hover:underline font-[family-name:var(--font-mono)] break-all"
                    >
                      {item.website_url}
                    </a>
                  )}
                </div>
                {item.category && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] uppercase ${CATEGORY_COLOURS[item.category] ?? ""}`}
                  >
                    {categoryLabel(item.category)}
                  </span>
                )}
              </div>

              <p className="text-sm text-text-1 whitespace-pre-wrap mb-3">
                {item.what_i_like}
              </p>

              {item.image_url && (
                <button
                  type="button"
                  onClick={() => setExpandedImage(item.image_url)}
                  className="mb-3 w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={item.company_name}
                    className="w-full rounded-md object-cover max-h-48 hover:opacity-80 transition-opacity"
                  />
                </button>
              )}

              {(item.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded-sm bg-ink-2 text-[9px] text-ink-3 font-[family-name:var(--font-mono)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setShowModal(true);
                  }}
                  className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-[0.1em]"
                >
                  EDIT
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(item.id)}
                  className="text-[9px] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)] tracking-[0.1em]"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <InspirationModal
          existing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            void load();
          }}
        />
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expandedImage}
            alt=""
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

function InspirationModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Inspiration | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    company_name: existing?.company_name ?? "",
    website_url: existing?.website_url ?? "",
    category: existing?.category ?? "",
    what_i_like: existing?.what_i_like ?? "",
    image_url: existing?.image_url ?? "",
    tags: (existing?.tags ?? []).join(", "),
  });

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!form.company_name.trim() || !form.what_i_like.trim()) return;
    const payload = {
      company_name: form.company_name.trim(),
      website_url: form.website_url.trim() || null,
      category: form.category || null,
      what_i_like: form.what_i_like.trim(),
      image_url: form.image_url.trim() || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (existing) {
      await fetch(`/api/ventures/inspiration/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/ventures/inspiration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    onSaved();
  }

  const inputCls =
    "w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-lg">
        <div className="text-base text-text-0 font-[family-name:var(--font-display)] mb-4">
          {existing ? "Edit Inspiration" : "Add Inspiration"}
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">COMPANY NAME *</Mono>
            <input
              className={inputCls}
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">WEBSITE URL</Mono>
            <input
              className={inputCls}
              value={form.website_url}
              onChange={(e) => set("website_url", e.target.value)}
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">CATEGORY</Mono>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">
              WHAT I LIKE *
            </Mono>
            <textarea
              className={inputCls}
              rows={5}
              value={form.what_i_like}
              onChange={(e) => set("what_i_like", e.target.value)}
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">IMAGE URL</Mono>
            <input
              className={inputCls}
              value={form.image_url}
              onChange={(e) => set("image_url", e.target.value)}
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">
              TAGS (comma separated)
            </Mono>
            <input
              className={inputCls}
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="saas, subscription, community"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-ink-3 hover:text-text-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!form.company_name.trim() || !form.what_i_like.trim()}
            className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] disabled:opacity-40"
          >
            {existing ? "UPDATE" : "ADD"}
          </button>
        </div>
      </div>
    </div>
  );
}
