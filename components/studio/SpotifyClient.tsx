"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Mono } from "@/components/dashboard/Mono";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type TimeRange = "short_term" | "medium_term" | "long_term";
type TrackSort = "default" | "duration" | "artist";
type RecentPreset = "latest" | "today" | "7d" | "30d" | "custom";
type PatternView = "hours" | "days";
type Limit = 10 | 25 | 50;

const RANGE_LABELS: Record<TimeRange, string> = {
  short_term: "4 WEEKS",
  medium_term: "6 MONTHS",
  long_term: "ALL TIME",
};

type SpotifyImage = { url: string; height: number; width: number };
type SpotifyArtistRef = { id: string; name: string };

type Track = {
  id: string;
  name: string;
  artists: SpotifyArtistRef[];
  album: { name: string; images: SpotifyImage[] };
  duration_ms: number;
  external_urls: { spotify: string };
};

type Artist = {
  id: string;
  name: string;
  genres?: string[];
  images: SpotifyImage[];
  popularity: number;
  external_urls: { spotify: string };
};

type RecentItem = {
  track: Track;
  played_at: string;
};

type PlayRecord = {
  track_id: string;
  track_name: string;
  artist_names: string;
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
  played_at: string;
};

type NowPlaying = {
  item?: Track;
  is_playing?: boolean;
  progress_ms?: number;
};

type PlayItem = {
  key: string;
  trackId: string;
  name: string;
  artists: string;
  albumArt: string;
  durationMs: number;
  playedAt: string;
  spotifyUrl: string;
  playCount?: number;
};

function msToMin(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function smallImg(images: SpotifyImage[]): string {
  if (!images.length) return "";
  const sorted = [...images].sort((a, b) => (a.width ?? 999) - (b.width ?? 999));
  return sorted[0].url;
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function buildHourData(items: PlayItem[]): { label: string; count: number }[] {
  const counts = new Array(24).fill(0);
  for (const item of items) {
    counts[new Date(item.playedAt).getHours()]++;
  }
  return counts.map((count, h) => ({ label: hourLabel(h), count }));
}

function buildDayData(items: PlayItem[]): { label: string; count: number }[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const counts = new Array(7).fill(0);
  for (const item of items) {
    const d = new Date(item.playedAt).getDay();
    counts[d === 0 ? 6 : d - 1]++;
  }
  return counts.map((count, i) => ({ label: days[i], count }));
}

function timeAgoShort(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function recentToPlayItems(recent: RecentItem[]): PlayItem[] {
  return recent.map((r, i) => ({
    key: `${r.track.id}-${i}`,
    trackId: r.track.id,
    name: r.track.name,
    artists: r.track.artists.map((a) => a.name).join(", "),
    albumArt: r.track.album.images.length > 0 ? smallImg(r.track.album.images) : "",
    durationMs: r.track.duration_ms,
    playedAt: r.played_at,
    spotifyUrl: r.track.external_urls.spotify,
  }));
}

function dbToPlayItems(plays: PlayRecord[]): PlayItem[] {
  return plays.map((p, i) => ({
    key: `db-${p.track_id}-${i}`,
    trackId: p.track_id,
    name: p.track_name,
    artists: p.artist_names,
    albumArt: p.album_art_url ?? "",
    durationMs: p.duration_ms ?? 0,
    playedAt: p.played_at,
    spotifyUrl: `https://open.spotify.com/track/${p.track_id}`,
  }));
}

const CHIP =
  "px-2 py-1 rounded-md transition-colors text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]";
const CHIP_ON = "bg-[#1DB954]/15 text-[#1DB954]";
const CHIP_OFF = "text-ink-3 hover:text-ink-4";
const INPUT =
  "bg-ink-0 border border-ink-2 rounded-md text-[11px] text-text-0 placeholder:text-ink-3 px-2 py-1 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)]";

export function SpotifyClient() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [range, setRange] = useState<TimeRange>("medium_term");
  const [tab, setTab] = useState<"tracks" | "artists" | "recent">("tracks");
  const [limit, setLimit] = useState<Limit>(25);

  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [loading, setLoading] = useState(true);

  // Track filters
  const [trackSearch, setTrackSearch] = useState("");
  const [trackSort, setTrackSort] = useState<TrackSort>("default");

  // Artist filters
  const [artistSearch, setArtistSearch] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  // Recent filters
  const [recentPreset, setRecentPreset] = useState<RecentPreset>("latest");
  const [recentSearch, setRecentSearch] = useState("");
  const [dedup, setDedup] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [historyPlays, setHistoryPlays] = useState<PlayRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Patterns
  const [patternView, setPatternView] = useState<PatternView>("hours");

  useEffect(() => {
    fetch("/api/spotify/status")
      .then((r) => r.json())
      .then((j) => setConnected(j.connected))
      .catch(() => setConnected(false));
  }, []);

  // Main data load
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tracks, artists, played, np] = await Promise.all([
          fetch(`/api/spotify/top-tracks?range=${range}&limit=${limit}`).then((r) => r.json()),
          fetch(`/api/spotify/top-artists?range=${range}&limit=${limit}`).then((r) => r.json()),
          fetch("/api/spotify/recently-played").then((r) => r.json()),
          fetch("/api/spotify/now-playing").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTopTracks(tracks?.items ?? []);
        setTopArtists(artists?.items ?? []);
        setRecent(played?.items ?? []);
        setNowPlaying(np?.playing ? np.data : null);
      } catch {
        // fetch errors handled silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, range, limit]);

  // Sync plays to DB on connect
  useEffect(() => {
    if (!connected) return;
    fetch("/api/spotify/sync-plays", { method: "POST" }).catch(() => {});
  }, [connected]);

  // Load history when date filter needs DB
  useEffect(() => {
    if (!connected) return;
    const needsDb = recentPreset === "7d" || recentPreset === "30d" || recentPreset === "custom";
    if (!needsDb) return;

    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      try {
        const now = new Date();
        let from: string;
        let to = now.toISOString().split("T")[0];

        if (recentPreset === "7d") {
          from = new Date(now.getTime() - 7 * 86_400_000).toISOString().split("T")[0];
        } else if (recentPreset === "30d") {
          from = new Date(now.getTime() - 30 * 86_400_000).toISOString().split("T")[0];
        } else {
          from = customFrom;
          to = customTo || to;
        }

        if (!from) {
          if (!cancelled) setLoadingHistory(false);
          return;
        }

        const res = await fetch(`/api/spotify/plays?from=${from}&to=${to}`);
        const data = await res.json();
        if (!cancelled) setHistoryPlays(data.plays ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, recentPreset, customFrom, customTo]);

  // ─── Computed ──────────────────────────────────────────────

  const filteredTracks = useMemo(() => {
    let tracks = [...topTracks];
    if (trackSearch) {
      const q = trackSearch.toLowerCase();
      tracks = tracks.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)),
      );
    }
    if (trackSort === "duration") {
      tracks.sort((a, b) => b.duration_ms - a.duration_ms);
    } else if (trackSort === "artist") {
      tracks.sort((a, b) =>
        (a.artists[0]?.name ?? "").localeCompare(b.artists[0]?.name ?? ""),
      );
    }
    return tracks;
  }, [topTracks, trackSearch, trackSort]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const a of topArtists) {
      for (const g of a.genres ?? []) set.add(g);
    }
    return Array.from(set).sort();
  }, [topArtists]);

  const filteredArtists = useMemo(() => {
    let artists = [...topArtists];
    if (artistSearch) {
      const q = artistSearch.toLowerCase();
      artists = artists.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (selectedGenres.size > 0) {
      artists = artists.filter((a) =>
        (a.genres ?? []).some((g) => selectedGenres.has(g)),
      );
    }
    return artists;
  }, [topArtists, artistSearch, selectedGenres]);

  const displayRecent: PlayItem[] = useMemo(() => {
    const needsDb = recentPreset === "7d" || recentPreset === "30d" || recentPreset === "custom";
    let items: PlayItem[];

    if (needsDb) {
      items = dbToPlayItems(historyPlays);
    } else {
      items = recentToPlayItems(recent);
      if (recentPreset === "today") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        items = items.filter((i) => new Date(i.playedAt) >= todayStart);
      }
    }

    if (recentSearch) {
      const q = recentSearch.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.artists.toLowerCase().includes(q),
      );
    }

    if (dedup) {
      const map = new Map<string, PlayItem & { playCount: number }>();
      for (const item of items) {
        const existing = map.get(item.trackId);
        if (existing) {
          existing.playCount++;
        } else {
          map.set(item.trackId, { ...item, playCount: 1 });
        }
      }
      items = Array.from(map.values()).sort(
        (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0),
      );
    }

    return items;
  }, [recent, historyPlays, recentPreset, recentSearch, dedup]);

  const patternSource = useMemo(() => {
    const needsDb = recentPreset === "7d" || recentPreset === "30d" || recentPreset === "custom";
    return needsDb ? dbToPlayItems(historyPlays) : recentToPlayItems(recent);
  }, [recent, historyPlays, recentPreset]);

  // ─── Early returns ────────────────────────────────────────

  if (connected === null) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Checking connection…
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6">
        <div className="w-16 h-16 rounded-full bg-[#1DB954]/15 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#1DB954">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
        </div>
        <h2 className="font-[family-name:var(--font-display)] italic text-xl text-text-0">
          Connect Spotify
        </h2>
        <p className="text-sm text-ink-3 max-w-sm text-center">
          Link your Spotify account to see your top tracks, artists, listening patterns, and what you&apos;re playing right now.
        </p>
        <a
          href="/api/spotify/authorize"
          className="px-6 py-3 rounded-full bg-[#1DB954] text-white hover:bg-[#1ed760] text-sm font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          CONNECT SPOTIFY
        </a>
      </div>
    );
  }

  function toggleGenre(g: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  const isRecentLoading = (recentPreset === "7d" || recentPreset === "30d" || recentPreset === "custom") && loadingHistory;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Spotify
        </h1>
        <div className="flex items-center gap-3">
          {/* Time range */}
          <div className="flex items-center gap-1">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`${CHIP} ${range === r ? CHIP_ON : CHIP_OFF}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {/* Limit */}
          {tab !== "recent" && (
            <div className="flex items-center gap-1">
              {([10, 25, 50] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLimit(n)}
                  className={`${CHIP} ${limit === n ? CHIP_ON : CHIP_OFF}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Now Playing */}
      {nowPlaying?.item && (
        <div className="bg-ink-1 rounded-md p-4 flex items-center gap-4 border border-[#1DB954]/30">
          <div className="relative shrink-0">
            {nowPlaying.item.album.images.length > 0 && (
              <Image
                src={smallImg(nowPlaying.item.album.images)}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="w-12 h-12 rounded-md"
              />
            )}
            {nowPlaying.is_playing && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#1DB954] border-2 border-ink-1 animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Mono className="text-[9px] text-[#1DB954]">
              {nowPlaying.is_playing ? "NOW PLAYING" : "PAUSED"}
            </Mono>
            <div className="text-sm text-text-0 truncate">{nowPlaying.item.name}</div>
            <div className="text-xs text-ink-3 truncate">
              {nowPlaying.item.artists.map((a) => a.name).join(", ")}
            </div>
          </div>
          {nowPlaying.progress_ms != null && (
            <Mono className="text-[10px] text-ink-3 shrink-0">
              {msToMin(nowPlaying.progress_ms)} / {msToMin(nowPlaying.item.duration_ms)}
            </Mono>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {(["tracks", "artists", "recent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`${CHIP} ${tab === t ? "bg-accent/15 text-accent" : CHIP_OFF}`}
          >
            {t === "tracks" ? "TOP TRACKS" : t === "artists" ? "TOP ARTISTS" : "RECENTLY PLAYED"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : (
        <>
          {/* ─── TOP TRACKS ─────────────────────────────────── */}
          {tab === "tracks" && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  placeholder="Search tracks or artists…"
                  className={`${INPUT} flex-1 min-w-[180px]`}
                />
                <div className="flex items-center gap-1">
                  {(["default", "duration", "artist"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTrackSort(s)}
                      className={`${CHIP} ${trackSort === s ? CHIP_ON : CHIP_OFF}`}
                    >
                      {s === "default" ? "DEFAULT" : s === "duration" ? "DURATION" : "ARTIST"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {filteredTracks.map((track, i) => (
                  <a
                    key={track.id}
                    href={track.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-ink-1 transition-colors group"
                  >
                    <Mono className="text-[10px] text-ink-3 w-5 text-right shrink-0">{i + 1}</Mono>
                    {track.album.images.length > 0 && (
                      <Image src={smallImg(track.album.images)} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-0 truncate group-hover:text-[#1DB954] transition-colors">
                        {track.name}
                      </div>
                      <div className="text-xs text-ink-3 truncate">
                        {track.artists.map((a) => a.name).join(", ")} · {track.album.name}
                      </div>
                    </div>
                    <Mono className="text-[10px] text-ink-3 shrink-0">{msToMin(track.duration_ms)}</Mono>
                  </a>
                ))}
                {filteredTracks.length === 0 && (
                  <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                    {trackSearch ? "No tracks match your search." : "No top tracks for this period."}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ─── TOP ARTISTS ────────────────────────────────── */}
          {tab === "artists" && (
            <>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={artistSearch}
                  onChange={(e) => setArtistSearch(e.target.value)}
                  placeholder="Search artists…"
                  className={`${INPUT} w-full`}
                />
                {allGenres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedGenres.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedGenres(new Set())}
                        className={`${CHIP} text-danger hover:text-danger`}
                      >
                        CLEAR
                      </button>
                    )}
                    {allGenres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGenre(g)}
                        className={`${CHIP} ${selectedGenres.has(g) ? CHIP_ON : CHIP_OFF}`}
                      >
                        {g.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {filteredArtists.map((artist, i) => (
                  <a
                    key={artist.id}
                    href={artist.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-ink-1 rounded-md p-3 hover:bg-ink-2/60 transition-colors group flex flex-col items-center gap-2"
                  >
                    {artist.images.length > 0 ? (
                      <Image
                        src={smallImg(artist.images)}
                        alt=""
                        width={64}
                        height={64}
                        unoptimized
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-ink-2 flex items-center justify-center text-xl text-ink-3">
                        {artist.name.charAt(0)}
                      </div>
                    )}
                    <div className="text-center min-w-0 w-full">
                      <Mono className="text-[9px] text-ink-3">#{i + 1}</Mono>
                      <div className="text-sm text-text-0 truncate group-hover:text-[#1DB954] transition-colors">
                        {artist.name}
                      </div>
                      {(artist.genres ?? []).length > 0 && (
                        <div className="text-[10px] text-ink-3 truncate">
                          {(artist.genres ?? []).slice(0, 2).join(", ")}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
                {filteredArtists.length === 0 && (
                  <p className="col-span-full text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                    {artistSearch || selectedGenres.size > 0 ? "No artists match your filters." : "No top artists for this period."}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ─── RECENTLY PLAYED ────────────────────────────── */}
          {tab === "recent" && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder="Search tracks or artists…"
                    className={`${INPUT} flex-1 min-w-[180px]`}
                  />
                  <label className={`${CHIP} flex items-center gap-1 cursor-pointer ${dedup ? CHIP_ON : CHIP_OFF}`}>
                    <input
                      type="checkbox"
                      checked={dedup}
                      onChange={(e) => setDedup(e.target.checked)}
                      className="accent-[#1DB954] w-3 h-3"
                    />
                    DEDUPLICATE
                  </label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    {(["latest", "today", "7d", "30d", "custom"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setRecentPreset(p)}
                        className={`${CHIP} ${recentPreset === p ? CHIP_ON : CHIP_OFF}`}
                      >
                        {p === "latest" ? "LATEST" : p === "today" ? "TODAY" : p === "7d" ? "7 DAYS" : p === "30d" ? "30 DAYS" : "CUSTOM"}
                      </button>
                    ))}
                  </div>
                  {recentPreset === "custom" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className={INPUT}
                      />
                      <Mono className="text-[9px] text-ink-3">TO</Mono>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className={INPUT}
                      />
                      {(customFrom || customTo) && (
                        <button
                          type="button"
                          onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                          className={`${CHIP} text-danger hover:text-danger`}
                        >
                          CLEAR
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {isRecentLoading ? (
                <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                  Loading history…
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {displayRecent.map((item) => (
                    <a
                      key={item.key}
                      href={item.spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-ink-1 transition-colors group"
                    >
                      {item.albumArt && (
                        <Image src={item.albumArt} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-0 truncate group-hover:text-[#1DB954] transition-colors">
                          {item.name}
                        </div>
                        <div className="text-xs text-ink-3 truncate">
                          {item.artists}
                        </div>
                      </div>
                      {item.playCount != null && item.playCount > 1 && (
                        <Mono className="text-[10px] text-[#1DB954] shrink-0">
                          ×{item.playCount}
                        </Mono>
                      )}
                      <Mono className="text-[10px] text-ink-3 shrink-0">
                        {timeAgoShort(item.playedAt)}
                      </Mono>
                    </a>
                  ))}
                  {displayRecent.length === 0 && (
                    <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                      {recentSearch ? "No plays match your search." : "No plays found for this period."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ─── LISTENING PATTERNS ─────────────────────────── */}
          {patternSource.length > 0 && (
            <div className="bg-ink-1 rounded-md p-4 flex flex-col gap-3 mt-2">
              <div className="flex items-center justify-between">
                <Mono className="text-[10px] text-ink-3">
                  LISTENING PATTERNS ({patternSource.length} PLAYS)
                </Mono>
                <div className="flex items-center gap-1">
                  {(["hours", "days"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPatternView(v)}
                      className={`${CHIP} ${patternView === v ? CHIP_ON : CHIP_OFF}`}
                    >
                      {v === "hours" ? "BY HOUR" : "BY DAY"}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={patternView === "hours" ? buildHourData(patternSource) : buildDayData(patternSource)}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#666" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#1a1917", border: "1px solid #333", borderRadius: 6, fontSize: 11 }}
                    formatter={(val) => [`${val} plays`, ""]}
                    labelFormatter={(l) => `${l}`}
                  />
                  <Bar dataKey="count" fill="#1DB954" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
