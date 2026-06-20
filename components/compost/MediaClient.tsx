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
  MEDIA_STATUS_LABEL_BY_KIND,
} from "@/lib/types/media";

type Toast = { kind: "ok" | "error"; text: string } | null;
type OwnedFilter = "all" | "owned" | "not_owned";

type Episode = {
  id: string;
  item_id: string;
  title: string;
  episode_number: number | null;
  season_number: number | null;
  duration_minutes: number | null;
  listened_at: string | null;
  rating: number | null;
  comments: string | null;
  created_at: string;
};

const STATUS_TONE: Record<MediaStatus, string> = {
  backlog: "text-ink-3 bg-ink-2/40 border-ink-2",
  in_progress: "text-accent bg-accent/15 border-accent/40",
  completed: "text-ok bg-ok/15 border-ok/40",
  dropped: "text-ink-3 bg-ink-2/40 border-ink-2",
};

const STREAMING_BADGE: Record<string, { label: string; color: string }> = {
  netflix: { label: "Netflix", color: "#E50914" },
  prime: { label: "Prime", color: "#00A8E1" },
  disney: { label: "Disney+", color: "#113CCF" },
  apple: { label: "Apple TV+", color: "#555555" },
  mubi: { label: "MUBI", color: "#000000" },
};

function streamingBadge(service: string) {
  const known = STREAMING_BADGE[service];
  return known ?? { label: service.charAt(0).toUpperCase() + service.slice(1), color: "var(--ink-2)" };
}

function justWatchUrl(title: string) {
  return `https://www.justwatch.com/uk/search?q=${encodeURIComponent(title)}`;
}

function youtubeUrl(title: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;
}

function spotifyUrl(title: string, creator?: string | null) {
  const q = creator ? `${title} ${creator}` : title;
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`;
}

function youtubeMusicUrl(title: string, creator?: string | null) {
  const q = creator ? `${title} ${creator}` : title;
  return `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;
}

function amazonUrl(title: string, creator?: string | null) {
  const q = creator ? `${title} ${creator}` : title;
  return `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`;
}

function Stars({
  rating,
  onRate,
  size = "text-[10px]",
}: {
  rating: number | null;
  onRate?: (r: number) => void;
  size?: string;
}) {
  return (
    <span className={`${size} font-[family-name:var(--font-mono)]`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => onRate?.(n)}
          className={`${onRate ? "cursor-pointer hover:text-warn" : ""} ${
            rating && n <= rating ? "text-warn" : "text-ink-2"
          }`}
        >
          {rating && n <= rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.round(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function MediaClient() {
  const [tab, setTab] = useState<MediaType>("watch");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCreator, setDraftCreator] = useState("");
  const [adding, setAdding] = useState(false);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Map<string, Episode[]>>(new Map());
  const [showEpisodeModal, setShowEpisodeModal] = useState<string | null>(null);
  const [epTitle, setEpTitle] = useState("");
  const [epNumber, setEpNumber] = useState("");
  const [epSeason, setEpSeason] = useState("");
  const [epDuration, setEpDuration] = useState("");
  const [epRating, setEpRating] = useState(0);
  const [epComments, setEpComments] = useState("");
  const [epSaving, setEpSaving] = useState(false);

  const statusLabels = MEDIA_STATUS_LABEL_BY_KIND[tab];

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

  async function refreshStreaming(item: MediaItem) {
    const r = await fetch("/api/media/streaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: item.title }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      services?: string[];
      checked_at?: string;
    };
    const services = j.services?.length ? j.services : null;
    await patchItem(item.id, {
      streaming_services: services,
      streaming_checked_at: j.checked_at ?? new Date().toISOString(),
    });
  }

  async function loadEpisodes(itemId: string) {
    const res = await fetch(`/api/media/${itemId}/episodes`);
    const data = await res.json();
    setEpisodes((prev) => new Map(prev).set(itemId, data.episodes ?? []));
  }

  function toggleExpand(itemId: string) {
    if (expandedItem === itemId) {
      setExpandedItem(null);
    } else {
      setExpandedItem(itemId);
      if (!episodes.has(itemId)) loadEpisodes(itemId);
    }
  }

  function resetEpisodeForm() {
    setEpTitle(""); setEpNumber(""); setEpSeason("");
    setEpDuration(""); setEpRating(0); setEpComments("");
  }

  async function saveEpisode() {
    if (!showEpisodeModal || !epTitle.trim()) return;
    setEpSaving(true);
    try {
      const res = await fetch(`/api/media/${showEpisodeModal}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: epTitle.trim(),
          episode_number: epNumber ? Number(epNumber) : null,
          season_number: epSeason ? Number(epSeason) : null,
          duration_minutes: epDuration ? Number(epDuration) : null,
          rating: epRating || null,
          comments: epComments.trim() || null,
        }),
      });
      if (res.ok) {
        resetEpisodeForm();
        setShowEpisodeModal(null);
        loadEpisodes(showEpisodeModal);
        show("ok", "Episode logged");
      }
    } finally {
      setEpSaving(false);
    }
  }

  async function deleteEpisode(itemId: string, episodeId: string) {
    await fetch(`/api/media/${itemId}/episodes/${episodeId}`, { method: "DELETE" });
    setEpisodes((prev) => {
      const next = new Map(prev);
      next.set(itemId, (next.get(itemId) ?? []).filter((e) => e.id !== episodeId));
      return next;
    });
  }

  const filtered = tab === "read" && ownedFilter !== "all"
    ? items.filter((i) => ownedFilter === "owned" ? i.owned : !i.owned)
    : items;

  const grouped = MEDIA_STATUSES.reduce(
    (acc, s) => {
      acc[s] = filtered.filter((i) => i.media_status === s);
      return acc;
    },
    {} as Record<MediaStatus, MediaItem[]>,
  );

  const inputCls = "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

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
                onClick={() => { setTab(t); setOwnedFilter("all"); setExpandedItem(null); }}
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

      {/* Read list ownership filter */}
      {tab === "read" && items.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
          {(["all", "owned", "not_owned"] as const).map((f) => {
            const labels: Record<OwnedFilter, string> = { all: "ALL", owned: "OWNED", not_owned: "NOT OWNED" };
            return (
              <button
                key={f}
                type="button"
                onClick={() => setOwnedFilter(f)}
                className={`px-2 py-1 rounded-md transition-colors ${
                  ownedFilter === f
                    ? "bg-accent/15 text-accent"
                    : "text-ink-3 hover:text-ink-4"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
      )}

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
                    {statusLabels[status]}
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
                      tab={tab}
                      statusLabels={statusLabels}
                      onPatch={patchItem}
                      onDelete={deleteItem}
                      onRefreshStreaming={refreshStreaming}
                      expanded={expandedItem === item.id}
                      onToggleExpand={() => toggleExpand(item.id)}
                      episodes={episodes.get(item.id) ?? []}
                      onLogEpisode={() => setShowEpisodeModal(item.id)}
                      onDeleteEpisode={(epId) => deleteEpisode(item.id, epId)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Episode log modal */}
      {showEpisodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              Log Episode
            </h2>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TITLE</label>
                <input value={epTitle} onChange={(e) => setEpTitle(e.target.value)} className={inputCls} placeholder="Episode title" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">EPISODE #</label>
                  <input type="number" value={epNumber} onChange={(e) => setEpNumber(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SEASON #</label>
                  <input type="number" value={epSeason} onChange={(e) => setEpSeason(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">DURATION (min)</label>
                <input type="number" value={epDuration} onChange={(e) => setEpDuration(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">RATING</label>
                <div className="mt-1">
                  <Stars rating={epRating || null} onRate={setEpRating} size="text-xl" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">COMMENTS</label>
                <textarea value={epComments} onChange={(e) => setEpComments(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { resetEpisodeForm(); setShowEpisodeModal(null); }}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={saveEpisode}
                disabled={epSaving || !epTitle.trim()}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {epSaving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </div>
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

/* ─── Links row per media type ─────────────────────────────── */

function WatchLinks({ item, onRefresh }: { item: MediaItem; onRefresh: () => void }) {
  const services = Array.isArray(item.streaming_services) ? item.streaming_services : [];
  const jw = justWatchUrl(item.title);

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      {services.map((s) => {
        const badge = streamingBadge(s);
        return (
          <a
            key={s}
            href={jw}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[9px] font-[family-name:var(--font-mono)] tracking-wide px-1.5 py-0.5 rounded-full text-white/90 hover:opacity-80 transition-opacity"
            style={{ backgroundColor: badge.color }}
          >
            {badge.label}
          </a>
        );
      })}
      <a
        href={youtubeUrl(item.title)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ▶ YouTube
      </a>
      <button
        type="button"
        onClick={onRefresh}
        className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] transition-colors"
        title="Refresh streaming availability"
      >
        ↻ Refresh
      </button>
    </div>
  );
}

function ListenLinks({ item }: { item: MediaItem }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <a
        href={spotifyUrl(item.title, item.creator)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        🎵 Spotify
      </a>
      <a
        href={youtubeMusicUrl(item.title, item.creator)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ▶ YouTube Music
      </a>
    </div>
  );
}

function ReadLinks({ item }: { item: MediaItem }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <a
        href={amazonUrl(item.title, item.creator)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        🛒 Amazon
      </a>
    </div>
  );
}

/* ─── Review form ─────────────────────────────────────────── */

function ReviewForm({
  item,
  onPatch,
}: {
  item: MediaItem;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [reviewText, setReviewText] = useState(item.review ?? "");
  const [reviewRating, setReviewRating] = useState(item.rating ?? 0);
  const [dirty, setDirty] = useState(false);

  function save() {
    onPatch(item.id, {
      rating: reviewRating || null,
      review: reviewText.trim() || null,
      reviewed_at: new Date().toISOString(),
    });
    setDirty(false);
  }

  return (
    <div className="mt-2 p-2 rounded-lg bg-ink-0/60 border border-ink-2/50">
      <div className="flex items-center gap-2 mb-1">
        <Stars
          rating={reviewRating || null}
          onRate={(r) => { setReviewRating(r); setDirty(true); }}
          size="text-sm"
        />
        <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">
          {item.reviewed_at ? `Reviewed ${daysAgo(item.reviewed_at)}` : "Rate & review"}
        </span>
      </div>
      <textarea
        value={reviewText}
        onChange={(e) => { setReviewText(e.target.value); setDirty(true); }}
        placeholder="What did you think?"
        rows={2}
        className="w-full bg-transparent border border-ink-2/40 rounded text-xs text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 placeholder:text-ink-3 resize-y"
      />
      {dirty && (
        <button
          onClick={save}
          className="mt-1 px-2 py-0.5 rounded text-[9px] font-[family-name:var(--font-mono)] bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 transition-colors"
        >
          SAVE REVIEW
        </button>
      )}
    </div>
  );
}

/* ─── Row ──────────────────────────────────────────────────── */

function MediaRow({
  item,
  tab,
  statusLabels,
  onPatch,
  onDelete,
  onRefreshStreaming,
  expanded,
  onToggleExpand,
  episodes,
  onLogEpisode,
  onDeleteEpisode,
}: {
  item: MediaItem;
  tab: MediaType;
  statusLabels: Record<MediaStatus, string>;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onRefreshStreaming: (item: MediaItem) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  episodes: Episode[];
  onLogEpisode: () => void;
  onDeleteEpisode: (episodeId: string) => void;
}) {
  const tone = STATUS_TONE[item.media_status];
  const isCompleted = item.media_status === "completed";
  const isPodcast = tab === "listen" && (item.creator?.toLowerCase().includes("podcast") || item.title.toLowerCase().includes("podcast"));

  return (
    <li
      className={`group bg-ink-1 hover:bg-ink-2/60 rounded-md px-3 py-2 transition-colors ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {tab === "read" && item.owned && (
              <span className="text-[10px] shrink-0" title="Owned">📚</span>
            )}
            <span className={`text-sm ${isCompleted ? "text-ink-3 line-through" : "text-ink-4"}`}>
              {item.title}
            </span>
            {item.creator && (
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] truncate">
                {item.creator}
              </span>
            )}
            {isPodcast && episodes.length > 0 && (
              <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">
                {episodes.length} ep{episodes.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tab === "read" && (
            <label className="flex items-center gap-1 cursor-pointer" title="I own this">
              <input
                type="checkbox"
                checked={item.owned ?? false}
                onChange={(e) => onPatch(item.id, { owned: e.target.checked })}
                className="accent-accent w-3 h-3"
              />
              <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">OWN</span>
            </label>
          )}

          {item.rating && (
            <Stars rating={item.rating} size="text-[10px]" />
          )}

          {isPodcast && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] transition-colors"
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}

          <select
            value={item.media_status}
            onChange={(e) => {
              const next = e.target.value as MediaStatus;
              onPatch(item.id, { media_status: next });
            }}
            className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${tone} bg-transparent cursor-pointer outline-none`}
          >
            {MEDIA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
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
      </div>

      {/* Auto-generated links */}
      {tab === "watch" && <WatchLinks item={item} onRefresh={() => onRefreshStreaming(item)} />}
      {tab === "listen" && <ListenLinks item={item} />}
      {tab === "read" && <ReadLinks item={item} />}

      {/* Inline review form for completed items */}
      {isCompleted && <ReviewForm item={item} onPatch={onPatch} />}

      {/* Review text for non-completed items that have been reviewed */}
      {!isCompleted && item.review && (
        <p className="mt-1 text-xs text-ink-3 italic font-[family-name:var(--font-display)] truncate">
          {item.review}
        </p>
      )}

      {/* Podcast episodes section */}
      {isPodcast && expanded && (
        <div className="mt-2 border-t border-ink-2/40 pt-2">
          <div className="flex items-center justify-between mb-2">
            <Mono className="text-[10px] text-ink-3">EPISODES</Mono>
            <button
              type="button"
              onClick={onLogEpisode}
              className="text-[9px] text-accent font-[family-name:var(--font-mono)] hover:underline"
            >
              + LOG EPISODE
            </button>
          </div>
          {episodes.length === 0 ? (
            <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              No episodes logged yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {episodes.map((ep) => (
                <div key={ep.id} className="flex items-center gap-2 py-1 group/ep">
                  {ep.episode_number != null && (
                    <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)] w-8 shrink-0">
                      {ep.season_number ? `S${ep.season_number}E${ep.episode_number}` : `#${ep.episode_number}`}
                    </span>
                  )}
                  <span className="text-xs text-ink-4 flex-1 truncate">{ep.title}</span>
                  {ep.rating && <Stars rating={ep.rating} size="text-[8px]" />}
                  {ep.listened_at && (
                    <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">
                      {daysAgo(ep.listened_at)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteEpisode(ep.id)}
                    className="opacity-0 group-hover/ep:opacity-100 text-ink-3 hover:text-danger text-[9px] transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
