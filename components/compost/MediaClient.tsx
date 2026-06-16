"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type {
  MediaItem,
  MediaType,
  MediaStatus,
} from "@/lib/types/media";
import {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MEDIA_TYPE_LABEL,
  MEDIA_STATUS_LABEL,
} from "@/lib/types/media";

type Toast = { kind: "ok" | "error"; text: string } | null;

const STATUS_TONE: Record<MediaStatus, string> = {
  backlog: "text-ink-3 bg-ink-2/40 border-ink-2",
  in_progress: "text-accent bg-accent/15 border-accent/40",
  completed: "text-ok bg-ok/15 border-ok/40",
  dropped: "text-ink-3 bg-ink-2/40 border-ink-2",
};

export function MediaClient() {
  const [tab, setTab] = useState<MediaType>("watch");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCreator, setDraftCreator] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/media?media_type=${tab}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { items?: MediaItem[] }) => {
        setItems(Array.isArray(j?.items) ? j.items : []);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(true), 0);
    load();
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function show(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  async function addItem() {
    if (!draftTitle.trim() || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          creator: draftCreator.trim() || null,
          media_type: tab,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        item?: MediaItem;
        error?: string;
      };
      if (!r.ok || !j.item) {
        show("error", j.error ?? "Add failed");
        return;
      }
      setItems((cur) => [j.item!, ...cur]);
      setDraftTitle("");
      setDraftCreator("");
      show("ok", "Added");
    } finally {
      setAdding(false);
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await r.json().catch(() => ({}))) as {
      item?: MediaItem;
      error?: string;
    };
    if (!r.ok || !j.item) {
      show("error", j.error ?? "Update failed");
      return;
    }
    setItems((cur) => cur.map((i) => (i.id === id ? j.item! : i)));
  }

  async function deleteItem(id: string) {
    if (!window.confirm("Delete this item?")) return;
    const r = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!r.ok) {
      show("error", "Delete failed");
      return;
    }
    setItems((cur) => cur.filter((i) => i.id !== id));
    show("ok", "Deleted");
  }

  const grouped = MEDIA_STATUSES.reduce(
    (acc, s) => {
      acc[s] = items.filter((i) => i.media_status === s);
      return acc;
    },
    {} as Record<MediaStatus, MediaItem[]>,
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Media
        </h1>
        <div
          role="tablist"
          aria-label="Media type"
          className="flex rounded-md border border-ink-2 overflow-hidden text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {MEDIA_TYPES.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className={`px-3 py-2 transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
                }`}
              >
                {MEDIA_TYPE_LABEL[t].toUpperCase()}
              </button>
            );
          })}
        </div>
      </header>

      {/* Add form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder={`Add to ${MEDIA_TYPE_LABEL[tab].toLowerCase()} list…`}
          className="flex-1 bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 placeholder:italic px-3 py-2 outline-none focus:border-ink-3"
        />
        <input
          type="text"
          value={draftCreator}
          onChange={(e) => setDraftCreator(e.target.value)}
          placeholder="Creator"
          className="w-32 bg-ink-1 border border-ink-2 rounded-md text-sm text-text-0 placeholder:text-ink-3 placeholder:italic px-3 py-2 outline-none focus:border-ink-3"
        />
        <button
          type="submit"
          disabled={!draftTitle.trim() || adding}
          className="px-4 py-2 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {adding ? "…" : "ADD"}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No items yet — add one above.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {MEDIA_STATUSES.map((status) => {
            const group = grouped[status];
            if (group.length === 0) return null;
            return (
              <section key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <Mono className="text-[10px] text-ink-3">
                    {MEDIA_STATUS_LABEL[status]}
                  </Mono>
                  <Mono className="text-[10px] text-ink-3">
                    {group.length}
                  </Mono>
                </div>
                <ul className="flex flex-col gap-1">
                  {group.map((item) => (
                    <MediaRow
                      key={item.id}
                      item={item}
                      onPatch={patchItem}
                      onDelete={deleteItem}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
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

function MediaRow({
  item,
  onPatch,
  onDelete,
}: {
  item: MediaItem;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const tone = STATUS_TONE[item.media_status];
  const isCompleted = item.media_status === "completed";

  return (
    <li
      className={`group flex items-center gap-3 bg-ink-1 hover:bg-ink-2/60 rounded-md px-3 py-2 transition-colors ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isCompleted ? "text-ink-3 line-through" : "text-ink-4"}`}>
            {item.title}
          </span>
          {item.creator && (
            <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] truncate">
              {item.creator}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isCompleted && item.rating && (
          <span className="text-[10px] text-warn font-[family-name:var(--font-mono)]">
            {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
          </span>
        )}

        <select
          value={item.media_status}
          onChange={(e) => {
            const next = e.target.value as MediaStatus;
            if (next === "completed" && !item.rating) {
              const r = window.prompt("Rate 1-5 (optional):", "");
              const rating = r ? Math.max(1, Math.min(5, parseInt(r) || 0)) : null;
              onPatch(item.id, {
                media_status: next,
                ...(rating ? { rating } : {}),
              });
            } else {
              onPatch(item.id, { media_status: next });
            }
          }}
          className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${tone} bg-transparent cursor-pointer outline-none`}
        >
          {MEDIA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MEDIA_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger text-xs transition-opacity"
          aria-label="Delete"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
