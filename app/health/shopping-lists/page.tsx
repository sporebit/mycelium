"use client";

import { useCallback, useEffect, useState } from "react";

type ShoppingItem = { amount: string; unit: string | null; name: string };

type ShoppingList = {
  id: string;
  title: string;
  items: ShoppingItem[];
  week_start: string | null;
  sent_to_telegram: boolean;
  sent_at: string | null;
  created_at: string;
};

export default function ShoppingListsPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health/shopping-lists");
      const data = await res.json();
      setLists(data.lists ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function sendTelegram(id: string) {
    setSending(id);
    try {
      const res = await fetch(`/api/health/shopping-lists/${id}/send-telegram`, { method: "POST" });
      if (res.ok) {
        setLists((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, sent_to_telegram: true, sent_at: new Date().toISOString() } : l,
          ),
        );
      }
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-6">
        Shopping Lists
      </h1>

      {lists.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
          No shopping lists yet. Generate one from the Meal Planner.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => (
            <div key={list.id} className="border border-ink-2 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(list.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-1/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
                    {list.title}
                  </span>
                  {list.sent_to_telegram && (
                    <span className="text-[9px] text-ok font-[family-name:var(--font-mono)]">✓ sent</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                    {list.items.length} items
                  </span>
                  <span className="text-ink-3 text-xs">{expanded.has(list.id) ? "▲" : "▼"}</span>
                </div>
              </button>

              {expanded.has(list.id) && (
                <div className="px-4 pb-4">
                  <div className="flex flex-col gap-1 mb-3">
                    {list.items.map((item, i) => (
                      <div key={i} className="flex items-baseline gap-2 py-0.5 text-sm">
                        <span className="text-ink-4 font-[family-name:var(--font-mono)] font-bold">
                          {item.amount}{item.unit ? ` ${item.unit}` : ""}
                        </span>
                        <span className="text-ink-4 font-[family-name:var(--font-display)]">
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => sendTelegram(list.id)}
                    disabled={sending === list.id}
                    className="px-3 py-1.5 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-40 transition-colors"
                  >
                    {sending === list.id ? "SENDING…" : list.sent_to_telegram ? "RESEND TO TELEGRAM" : "SEND TO TELEGRAM"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
