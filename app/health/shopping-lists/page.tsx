"use client";

import { useCallback, useEffect, useState } from "react";

type ShoppingItemNew = {
  id: string;
  name: string;
  quantity?: string;
  checked: boolean;
  added_by?: string;
};

type ShoppingItemLegacy = {
  amount: string;
  unit: string | null;
  name: string;
};

type ShoppingList = {
  id: string;
  title: string;
  items: (ShoppingItemNew | ShoppingItemLegacy)[];
  default_list?: boolean;
  week_start: string | null;
  sent_to_telegram: boolean;
  sent_at: string | null;
  created_at: string;
};

function isNewItem(item: ShoppingItemNew | ShoppingItemLegacy): item is ShoppingItemNew {
  return "id" in item && "checked" in item;
}

export default function ShoppingListsPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("Shopping List");
  const [createDefault, setCreateDefault] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

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

  async function createList() {
    const res = await fetch("/api/health/shopping-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: createTitle || "Shopping List", default_list: createDefault }),
    });
    if (res.ok) {
      setShowCreate(false);
      setCreateTitle("Shopping List");
      setCreateDefault(false);
      load();
    }
  }

  async function deleteList(id: string) {
    await fetch(`/api/health/shopping-lists/${id}`, { method: "DELETE" });
    setLists((prev) => prev.filter((l) => l.id !== id));
  }

  async function addItem(listId: string) {
    const name = (newItemText[listId] || "").trim();
    if (!name) return;
    const res = await fetch(`/api/health/shopping-lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNewItemText((prev) => ({ ...prev, [listId]: "" }));
      load();
    }
  }

  async function toggleItem(listId: string, itemId: string, checked: boolean) {
    await fetch(`/api/health/shopping-lists/${listId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    });
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        return {
          ...l,
          items: l.items.map((item) =>
            isNewItem(item) && item.id === itemId ? { ...item, checked } : item,
          ),
        };
      }),
    );
  }

  async function deleteItem(listId: string, itemId: string) {
    await fetch(`/api/health/shopping-lists/${listId}/items/${itemId}`, { method: "DELETE" });
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        return {
          ...l,
          items: l.items.filter((item) => !isNewItem(item) || item.id !== itemId),
        };
      }),
    );
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

  const inputCls = "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">
          Shopping Lists
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
        >
          NEW LIST
        </button>
      </div>

      {lists.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
          No shopping lists yet. Create one or generate from the Meal Planner.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => {
            const uncheckedCount = list.items.filter((item) =>
              isNewItem(item) ? !item.checked : true,
            ).length;
            return (
              <div key={list.id} className="border border-ink-2 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(list.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-1/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
                      {list.title}
                    </span>
                    {list.default_list && (
                      <span className="text-[9px] text-accent font-[family-name:var(--font-mono)]">{"★"} default</span>
                    )}
                    {list.sent_to_telegram && (
                      <span className="text-[9px] text-ok font-[family-name:var(--font-mono)]">{"✓"} sent</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                      {uncheckedCount}/{list.items.length} items
                    </span>
                    <span className="text-ink-3 text-xs">{expanded.has(list.id) ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expanded.has(list.id) && (
                  <div className="px-4 pb-4">
                    <div className="flex flex-col gap-1 mb-3">
                      {list.items.map((item, i) => {
                        if (isNewItem(item)) {
                          return (
                            <div
                              key={item.id}
                              className={`flex items-center gap-2 py-1 text-sm group ${item.checked ? "opacity-50" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => toggleItem(list.id, item.id, !item.checked)}
                                className="accent-[var(--color-accent)] shrink-0"
                              />
                              <span
                                className={`flex-1 font-[family-name:var(--font-display)] ${
                                  item.checked ? "line-through text-ink-3" : "text-ink-4"
                                }`}
                              >
                                {item.quantity && (
                                  <span className="font-[family-name:var(--font-mono)] font-bold mr-1">
                                    {item.quantity}
                                  </span>
                                )}
                                {item.name}
                              </span>
                              {item.added_by === "voice" && (
                                <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">{"🎙"}</span>
                              )}
                              <button
                                onClick={() => deleteItem(list.id, item.id)}
                                className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger text-xs transition-opacity"
                              >
                                {"✕"}
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="flex items-baseline gap-2 py-0.5 text-sm">
                            <span className="text-ink-4 font-[family-name:var(--font-mono)] font-bold">
                              {item.amount}{item.unit ? ` ${item.unit}` : ""}
                            </span>
                            <span className="text-ink-4 font-[family-name:var(--font-display)]">
                              {item.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add item input */}
                    <div className="flex gap-2 mb-3">
                      <input
                        value={newItemText[list.id] || ""}
                        onChange={(e) =>
                          setNewItemText((prev) => ({ ...prev, [list.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && addItem(list.id)}
                        placeholder="Add item…"
                        className={`${inputCls} flex-1`}
                      />
                      <button
                        onClick={() => addItem(list.id)}
                        disabled={!(newItemText[list.id] || "").trim()}
                        className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
                      >
                        ADD
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => sendTelegram(list.id)}
                        disabled={sending === list.id}
                        className="px-3 py-1.5 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-40 transition-colors"
                      >
                        {sending === list.id
                          ? "SENDING…"
                          : list.sent_to_telegram
                            ? "RESEND TO TELEGRAM"
                            : "SEND TO TELEGRAM"}
                      </button>
                      <button
                        onClick={() => deleteList(list.id)}
                        className="px-3 py-1.5 rounded-md border border-danger/40 text-danger text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-danger/10 transition-colors"
                      >
                        DELETE LIST
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create list modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              New Shopping List
            </h2>
            <div className="mb-4">
              <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">
                TITLE
              </label>
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className={inputCls}
                placeholder="Shopping List"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-4 font-[family-name:var(--font-mono)] cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={createDefault}
                onChange={(e) => setCreateDefault(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Set as default list (for voice capture)
            </label>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateTitle("Shopping List");
                  setCreateDefault(false);
                }}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={createList}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
              >
                CREATE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
