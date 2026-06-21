"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import Link from "next/link";

type Guide = {
  id: string;
  retailer: string;
  retailer_url: string | null;
  region: string;
  difficulty: string | null;
  account_age_required: string | null;
  payment_tips: string | null;
  size_selection_tips: string | null;
  checkout_tips: string | null;
  raffle_tips: string | null;
  vpn_recommended: boolean;
  bot_compatible: boolean;
  success_rate: string | null;
  last_updated: string | null;
  notes: string | null;
};

type ModalState = {
  retailer: string;
  retailer_url: string;
  region: string;
  difficulty: string;
};

const EMPTY_MODAL: ModalState = {
  retailer: "",
  retailer_url: "",
  region: "UK",
  difficulty: "",
};

const DIFF_COLOURS: Record<string, string> = {
  easy: "#84f5b8",
  medium: "#f5b56d",
  hard: "#f56d6d",
  bot_only: "#f56db5",
};

const DIFF_LABELS: Record<string, string> = {
  easy: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
  bot_only: "BOT ONLY",
};

const DIFFICULTIES = ["easy", "medium", "hard", "bot_only"];

export default function CookGuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDiff, setFilterDiff] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalState>(EMPTY_MODAL);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/drops/cook-guides");
      if (r.ok) {
        const j = await r.json();
        setGuides(j.guides);
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

  const filtered = guides.filter((g) => {
    if (filterDiff !== "all" && g.difficulty !== filterDiff) return false;
    if (filterRegion !== "all" && g.region !== filterRegion) return false;
    return true;
  });

  const regions = [...new Set(guides.map((g) => g.region))].sort();

  async function handleCreate() {
    if (!form.retailer.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/drops/cook-guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retailer: form.retailer,
          retailer_url: form.retailer_url || null,
          region: form.region,
          difficulty: form.difficulty || null,
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Cook Guides
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          ADD RETAILER
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", ...DIFFICULTIES].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDiff(d)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              filterDiff === d
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {d === "all" ? "All" : DIFF_LABELS[d] ?? d}
          </button>
        ))}
        <select
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
          className="bg-ink-1 border border-ink-2 rounded-md text-[10px] font-[family-name:var(--font-mono)] text-ink-3 px-2 py-1 outline-none"
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading guides…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No cook guides yet. Add a retailer to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((g) => {
            const dCol = g.difficulty
              ? DIFF_COLOURS[g.difficulty] ?? "#555"
              : "#555";
            return (
              <div
                key={g.id}
                className="rounded-md bg-ink-1 border border-transparent p-4 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-0">
                    {g.retailer}
                  </span>
                  {g.difficulty && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em]"
                      style={{
                        color: dCol,
                        backgroundColor: `${dCol}20`,
                        border: `1px solid ${dCol}40`,
                      }}
                    >
                      {DIFF_LABELS[g.difficulty]}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3">
                    {g.region}
                  </span>
                  {g.bot_compatible && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-[#f56db5]/15 text-[#f56db5] border border-[#f56db5]/30">
                      BOT OK
                    </span>
                  )}
                  {g.vpn_recommended && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-[#f5b56d]/15 text-[#f5b56d] border border-[#f5b56d]/30">
                      VPN
                    </span>
                  )}
                </div>
                {g.success_rate && (
                  <div className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
                    Success: {g.success_rate}
                  </div>
                )}
                {g.checkout_tips && (
                  <div className="text-xs text-text-1 line-clamp-2">
                    {g.checkout_tips.slice(0, 100)}
                    {g.checkout_tips.length > 100 ? "…" : ""}
                  </div>
                )}
                {g.last_updated && (
                  <Mono className="text-[9px] text-ink-3">
                    Updated{" "}
                    {new Date(g.last_updated + "T00:00:00").toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </Mono>
                )}
                <div className="flex gap-2 mt-1">
                  <Link
                    href={`/drops/cook-guides/${g.id}`}
                    className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-accent hover:text-accent/80 transition-colors"
                  >
                    VIEW GUIDE →
                  </Link>
                  {g.retailer_url && (
                    <a
                      href={g.retailer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink-3 hover:text-text-0 transition-colors"
                    >
                      VISIT SITE →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Retailer modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-lg w-full max-w-md p-6">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0 mb-4">
              Add Retailer
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  RETAILER <span className="text-accent">*</span>
                </Mono>
                <input
                  type="text"
                  value={form.retailer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retailer: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  URL
                </Mono>
                <input
                  type="text"
                  value={form.retailer_url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retailer_url: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                    REGION
                  </Mono>
                  <select
                    value={form.region}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, region: e.target.value }))
                    }
                    className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                  >
                    {["UK", "EU", "US", "Global"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                    DIFFICULTY
                  </Mono>
                  <select
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, difficulty: e.target.value }))
                    }
                    className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                  >
                    <option value="">—</option>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {DIFF_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
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
                disabled={saving || !form.retailer.trim()}
                className="px-4 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
              >
                {saving ? "SAVING…" : "ADD"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
