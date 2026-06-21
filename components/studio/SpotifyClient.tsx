"use client";

import { useEffect, useState } from "react";
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
  genres: string[];
  images: SpotifyImage[];
  popularity: number;
  external_urls: { spotify: string };
};

type RecentItem = {
  track: Track;
  played_at: string;
};

type NowPlaying = {
  item?: Track;
  is_playing?: boolean;
  progress_ms?: number;
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

export function SpotifyClient() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [range, setRange] = useState<TimeRange>("medium_term");
  const [tab, setTab] = useState<"tracks" | "artists" | "recent">("tracks");

  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/spotify/status")
      .then((r) => r.json())
      .then((j) => setConnected(j.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tracks, artists, played, np] = await Promise.all([
          fetch(`/api/spotify/top-tracks?range=${range}`).then((r) => r.json()),
          fetch(`/api/spotify/top-artists?range=${range}`).then((r) => r.json()),
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
  }, [connected, range]);

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
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
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

  const hourData = buildHourData(recent);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Spotify
        </h1>
        <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-1 rounded-md transition-colors ${
                range === r
                  ? "bg-[#1DB954]/15 text-[#1DB954]"
                  : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
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
      <div className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em]">
        {(["tracks", "artists", "recent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-2 py-1 rounded-md transition-colors ${
              tab === t
                ? "bg-accent/15 text-accent"
                : "text-ink-3 hover:text-ink-4"
            }`}
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
          {tab === "tracks" && (
            <div className="flex flex-col gap-1">
              {topTracks.map((track, i) => (
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
              {topTracks.length === 0 && (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                  No top tracks for this period.
                </p>
              )}
            </div>
          )}

          {tab === "artists" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {topArtists.map((artist, i) => (
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
                    {artist.genres.length > 0 && (
                      <div className="text-[10px] text-ink-3 truncate">
                        {artist.genres.slice(0, 2).join(", ")}
                      </div>
                    )}
                  </div>
                </a>
              ))}
              {topArtists.length === 0 && (
                <p className="col-span-full text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                  No top artists for this period.
                </p>
              )}
            </div>
          )}

          {tab === "recent" && (
            <div className="flex flex-col gap-1">
              {recent.map((item, i) => {
                const ago = timeAgoShort(item.played_at);
                return (
                  <a
                    key={`${item.track.id}-${i}`}
                    href={item.track.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-ink-1 transition-colors group"
                  >
                    {item.track.album.images.length > 0 && (
                      <Image src={smallImg(item.track.album.images)} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-0 truncate group-hover:text-[#1DB954] transition-colors">
                        {item.track.name}
                      </div>
                      <div className="text-xs text-ink-3 truncate">
                        {item.track.artists.map((a) => a.name).join(", ")}
                      </div>
                    </div>
                    <Mono className="text-[10px] text-ink-3 shrink-0">{ago}</Mono>
                  </a>
                );
              })}
              {recent.length === 0 && (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
                  No recent plays found.
                </p>
              )}
            </div>
          )}

          {/* Listening Patterns */}
          {recent.length > 0 && (
            <div className="bg-ink-1 rounded-md p-4 flex flex-col gap-3 mt-2">
              <Mono className="text-[10px] text-ink-3">LISTENING PATTERNS (LAST 50 PLAYS)</Mono>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={hourData}>
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

function buildHourData(recent: RecentItem[]): { label: string; count: number }[] {
  const counts = new Array(24).fill(0);
  for (const item of recent) {
    const h = new Date(item.played_at).getHours();
    counts[h]++;
  }
  return counts.map((count, h) => ({ label: hourLabel(h), count }));
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
