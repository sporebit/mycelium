"use client";
// DRAFT: End goal is feeding Claude recommendations.

import { useState, useMemo } from "react";

type ItemType = "film" | "book" | "show" | "podcast";
type ItemStatus = "want" | "in-progress" | "done";

type WatchlistItem = {
  id: string;
  type: ItemType;
  title: string;
  status: ItemStatus;
  rating: number | null;
  notes: string;
};

const SAMPLE_ITEMS: WatchlistItem[] = [
  { id: "w1", type: "film", title: "Stalker (1979)", status: "want", rating: null, notes: "Tarkovsky, long overdue" },
  { id: "w2", type: "book", title: "Godel, Escher, Bach", status: "in-progress", rating: null, notes: "Chapter 8, dense but worth it" },
  { id: "w3", type: "show", title: "Severance", status: "done", rating: 5, notes: "Season 2 was incredible" },
  { id: "w4", type: "podcast", title: "Lex Fridman #400", status: "done", rating: 4, notes: "Guest was great on consciousness" },
  { id: "w5", type: "film", title: "The Substance", status: "done", rating: 3, notes: "Visually striking, script uneven" },
  { id: "w6", type: "book", title: "Thinking, Fast and Slow", status: "want", rating: null, notes: "" },
  { id: "w7", type: "show", title: "Shogun", status: "in-progress", rating: null, notes: "Episode 5" },
  { id: "w8", type: "podcast", title: "Huberman - Sleep Toolkit", status: "want", rating: null, notes: "Recommended by a friend" },
];

const TYPE_LABELS: Record<ItemType, string> = {
  film: "Film",
  book: "Book",
  show: "Show",
  podcast: "Podcast",
};

const STATUS_ORDER: Record<ItemStatus, number> = {
  "in-progress": 0,
  want: 1,
  done: 2,
};

function statusBadgeClass(s: ItemStatus): string {
  switch (s) {
    case "want": return "border-accent/40 text-accent bg-accent/10";
    case "in-progress": return "border-warn/40 text-warn bg-warn/10";
    case "done": return "border-ok/40 text-ok bg-ok/10";
  }
}

function typeBadgeClass(_: ItemType): string {
  return "border-ink-2 text-ink-3 bg-ink-0";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="font-[family-name:var(--font-mono)] tabular-nums text-xs text-warn tracking-wide">
      {Array.from({ length: 5 }, (_, i) => (i < rating ? "★" : "☆")).join("")}
    </span>
  );
}

const inputClass =
  "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
const labelClass =
  "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

export function WatchlistClient() {
  const [items, setItems] = useState<WatchlistItem[]>(SAMPLE_ITEMS);
  const [showAdd, setShowAdd] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<ItemStatus, WatchlistItem[]> = {
      "in-progress": [],
      want: [],
      done: [],
    };
    for (const item of items) {
      groups[item.status].push(item);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => STATUS_ORDER[a as ItemStatus] - STATUS_ORDER[b as ItemStatus])
      .filter(([, arr]) => arr.length > 0) as [ItemStatus, WatchlistItem[]][];
  }, [items]);

  function addItem(form: { type: ItemType; title: string; notes: string }) {
    const item: WatchlistItem = {
      id: `w${Date.now()}`,
      type: form.type,
      title: form.title,
      status: "want",
      rating: null,
      notes: form.notes,
    };
    setItems((prev) => [...prev, item]);
    setShowAdd(false);
  }

  return (
    <div className="flex flex-col gap-6 max-w-[800px]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Watchlist
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
            Films, books, shows, and podcasts to consume.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md transition-colors shrink-0"
        >
          {showAdd ? "CANCEL" : "+ ADD"}
        </button>
      </header>

      {showAdd && <AddItemForm onSubmit={addItem} />}

      {grouped.map(([status, statusItems]) => (
        <section key={status}>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
            {status === "in-progress" ? "In Progress" : status === "want" ? "Want" : "Done"}{" "}
            ({statusItems.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {statusItems.map((item) => (
              <li
                key={item.id}
                className="bg-ink-1 border border-ink-2 rounded-md p-3 flex items-start gap-3"
              >
                <span
                  className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${typeBadgeClass(item.type)}`}
                >
                  {TYPE_LABELS[item.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-ink-4 font-medium">{item.title}</span>
                    {item.rating != null && <StarRating rating={item.rating} />}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5">
                      {item.notes}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${statusBadgeClass(item.status)}`}
                >
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AddItemForm({ onSubmit }: { onSubmit: (f: { type: ItemType; title: string; notes: string }) => void }) {
  const [type, setType] = useState<ItemType>("film");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ type, title, notes });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className={inputClass}
          >
            {(Object.entries(TYPE_LABELS) as [ItemType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Interstellar"
            className={inputClass}
            required
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={!title.trim()}
        className="self-start bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md transition-colors"
      >
        Add to List
      </button>
    </form>
  );
}
