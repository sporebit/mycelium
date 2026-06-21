"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type Monitor = {
  id: string;
  name: string;
  url: string;
  check_interval_minutes: number;
  enabled: boolean;
  last_checked_at: string | null;
  last_status: string | null;
  in_stock: boolean;
  notify_telegram: boolean;
  keywords: string[];
  notes: string | null;
};

type ModalState = {
  name: string;
  url: string;
  check_interval_minutes: string;
  keywords: string;
  notify_telegram: boolean;
  notes: string;
};

const EMPTY_MODAL: ModalState = {
  name: "",
  url: "",
  check_interval_minutes: "5",
  keywords: "",
  notify_telegram: true,
  notes: "",
};

export default function MonitorPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalState>(EMPTY_MODAL);
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setNow(Date.now());
    })();
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/drops/monitors");
      if (r.ok) {
        const j = await r.json();
        setMonitors(j.monitors);
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

  async function handleCreate() {
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/drops/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          check_interval_minutes: Number(form.check_interval_minutes) || 5,
          notify_telegram: form.notify_telegram,
          keywords: form.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
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

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch(`/api/drops/monitors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await fetchData();
  }

  async function checkNow(id: string) {
    setCheckingId(id);
    try {
      await fetch(`/api/drops/monitors/${id}/check`, { method: "POST" });
      await fetchData();
    } finally {
      setCheckingId(null);
    }
  }

  async function deleteMonitor(id: string) {
    await fetch(`/api/drops/monitors/${id}`, { method: "DELETE" });
    await fetchData();
  }

  function timeAgo(ts: string | null): string {
    if (!ts || !now) return "never";
    const diff = now - new Date(ts).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Restock Monitor
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          ADD MONITOR
        </button>
      </header>

      {/* Warning banner */}
      <div className="rounded-md bg-[#f5b56d]/10 border border-[#f5b56d]/30 p-4">
        <div className="text-xs text-[#f5b56d] italic font-[family-name:var(--font-display)]">
          Monitors run via Vercel cron — checks every 5 minutes. Enable in
          Settings to activate.
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading monitors…
        </div>
      ) : monitors.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No monitors yet. Add one to start tracking restocks.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {monitors.map((m) => (
            <div
              key={m.id}
              className={`rounded-md bg-ink-1 border p-4 ${
                m.in_stock
                  ? "border-[#84f5b8]/40"
                  : "border-transparent"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-0">
                      {m.name}
                    </span>
                    {m.in_stock ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#84f5b8] bg-[#84f5b8]/15 border border-[#84f5b8]/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#84f5b8] animate-pulse" />
                        IN STOCK
                      </span>
                    ) : m.last_status === "error" ? (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#f56d6d] bg-[#f56d6d]/15 border border-[#f56d6d]/30">
                        ERROR
                      </span>
                    ) : m.last_status ? (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink-3 bg-ink-2">
                        OUT OF STOCK
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3 truncate mt-0.5">
                    {m.url}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Mono className="text-[9px] text-ink-3">
                    Every {m.check_interval_minutes}m
                  </Mono>
                  <Mono className="text-[9px] text-ink-3">
                    Checked {timeAgo(m.last_checked_at)}
                  </Mono>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => toggleEnabled(m.id, e.target.checked)}
                    className="accent-accent"
                  />
                  <Mono className="text-[9px] text-ink-3">
                    {m.enabled ? "ON" : "OFF"}
                  </Mono>
                </label>

                <button
                  type="button"
                  onClick={() => checkNow(m.id)}
                  disabled={checkingId === m.id}
                  className="px-2 py-1 rounded-md text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] border border-ink-2 text-ink-3 hover:text-text-0 hover:border-ink-3 transition-colors disabled:opacity-40"
                >
                  {checkingId === m.id ? "CHECKING…" : "CHECK NOW"}
                </button>

                <button
                  type="button"
                  onClick={() => deleteMonitor(m.id)}
                  className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-[#f56d6d] hover:text-[#f56d6d]/80"
                >
                  DELETE
                </button>
              </div>

              {(m.keywords ?? []).length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {m.keywords.map((k, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-ink-2 text-ink-3"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {m.notes && (
                <div className="text-[10px] text-ink-3 mt-1 truncate">
                  {m.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Monitor modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-lg w-full max-w-lg p-6">
            <h2 className="font-[family-name:var(--font-display)] italic text-lg text-text-0 mb-4">
              Add Monitor
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  NAME <span className="text-accent">*</span>
                </Mono>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder='e.g. "Palace Tri-Ferg Tee Black M"'
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  URL <span className="text-accent">*</span>
                </Mono>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                  placeholder="Product page URL"
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  CHECK INTERVAL
                </Mono>
                <select
                  value={form.check_interval_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      check_interval_minutes: e.target.value,
                    }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                >
                  {["5", "10", "30", "60"].map((v) => (
                    <option key={v} value={v}>
                      Every {v} minutes
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  KEYWORDS (comma-separated)
                </Mono>
                <input
                  type="text"
                  value={form.keywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                  placeholder='e.g. "Add to Bag, Add to Cart"'
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notify_telegram}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      notify_telegram: e.target.checked,
                    }))
                  }
                  className="accent-accent"
                />
                <span className="text-sm text-text-1">
                  Notify via Telegram
                </span>
              </label>
              <div>
                <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-1 block">
                  NOTES
                </Mono>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent resize-none h-16"
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
                  saving || !form.name.trim() || !form.url.trim()
                }
                className="px-4 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
              >
                {saving ? "SAVING…" : "ADD MONITOR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
