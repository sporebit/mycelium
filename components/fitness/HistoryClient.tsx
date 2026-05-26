"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import type {
  HistoryResponse,
  HistorySessionCard,
  SessionKind,
  WorkoutSessionType,
} from "@/lib/fitness/types";
import { pickParam, updateUrlParam } from "@/lib/util/url-params";

type Filter = SessionKind | "all";
const FILTER_VALUES = [
  "all",
  "cardio",
  "conditioning",
  "resistance",
  "mobility",
  "other",
] as const;

const FILTERS: { label: string; value: Filter }[] = [
  { label: "ALL", value: "all" },
  { label: "CARDIO", value: "cardio" },
  { label: "CONDITIONING", value: "conditioning" },
  { label: "RESISTANCE", value: "resistance" },
  { label: "MOBILITY", value: "mobility" },
  { label: "OTHER", value: "other" },
];

const SLOT_ICON: Record<string, string> = {
  morning: "🌅",
  afternoon: "🌙",
  extra: "➕",
};
const SLOT_LABEL: Record<string, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  extra: "EXTRA",
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtVolume(kg: number): string {
  if (kg < 1000) return `${kg} kg`;
  return `${kg.toLocaleString("en-US")} kg`;
}

function statsLine(s: HistorySessionCard): string {
  if (s.kind === "resistance") {
    const parts: string[] = [];
    parts.push(`${s.exercise_count} exercise${s.exercise_count === 1 ? "" : "s"}`);
    parts.push(`${s.set_count} set${s.set_count === 1 ? "" : "s"}`);
    parts.push(`${fmtVolume(s.total_volume_kg)} total`);
    if (s.duration_minutes != null) parts.push(fmtDuration(s.duration_minutes));
    return parts.join(" · ");
  }
  if (s.kind === "cardio") {
    const parts: string[] = [];
    parts.push(`${s.exercise_count} exercise${s.exercise_count === 1 ? "" : "s"}`);
    if (s.duration_active_min && s.duration_active_min > 0) {
      parts.push(`${s.duration_active_min} mins`);
    } else if (s.duration_minutes != null) {
      parts.push(fmtDuration(s.duration_minutes));
    }
    if (s.distance_km && s.distance_km > 0) parts.push(`${s.distance_km} km`);
    return parts.join(" · ");
  }
  return s.notes ? "free-form" : "free-form";
}

export function HistoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter: Filter = pickParam(searchParams, "kind", FILTER_VALUES, "all");
  const typeFilter = searchParams?.get("type") ?? null;

  const [sessions, setSessions] = useState<HistorySessionCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  function setFilter(v: Filter) {
    updateUrlParam(router, pathname, searchParams, "kind", v === "all" ? null : v);
  }
  function setTypeFilter(v: string | null) {
    updateUrlParam(router, pathname, searchParams, "type", v);
  }

  // Fetch type labels once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/fitness/session-types", { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const j = (await r.json()) as { types: WorkoutSessionType[] };
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const t of j.types ?? []) map[t.type_key] = t.label;
      setTypeLabels(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (
      currentFilter: SessionKind | "all",
      currentType: string | null,
      currentCursor: string | null,
      replace: boolean
    ) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/fitness/history", window.location.origin);
        if (currentFilter !== "all") url.searchParams.set("kind", currentFilter);
        if (currentType) url.searchParams.set("session_type", currentType);
        if (currentCursor) url.searchParams.set("cursor", currentCursor);
        url.searchParams.set("limit", "20");
        const r = await fetch(url.toString(), { cache: "no-store" });
        if (!r.ok) {
          setError("Could not load history");
          return;
        }
        const j = (await r.json()) as HistoryResponse;
        setSessions((prev) => (replace ? j.sessions : [...prev, ...j.sessions]));
        setCursor(j.next_cursor);
        setHasMore(!!j.next_cursor);
        if (j.type_counts) setTypeCounts(j.type_counts);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load + filter changes — reset and refetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSessions([]);
      setCursor(null);
      setHasMore(true);
      if (cancelled) return;
      await fetchPage(filter, typeFilter, null, true);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, typeFilter, fetchPage]);

  // IntersectionObserver for the bottom sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasMore || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void fetchPage(filter, typeFilter, cursor, false);
            break;
          }
        }
      },
      { rootMargin: "500px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filter, typeFilter, cursor, hasMore, loading, fetchPage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
          History
        </h1>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border transition-colors ${
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Secondary type filter chips — only types the user has used */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors ${
              typeFilter == null
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            ALL TYPES
          </button>
          {Object.entries(typeCounts)
            .sort((a, b) => (typeLabels[a[0]] ?? a[0]).localeCompare(typeLabels[b[0]] ?? b[0]))
            .map(([key, count]) => {
              const active = typeFilter === key;
              const lbl = typeLabels[key] ?? key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(active ? null : key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
                  }`}
                >
                  {lbl} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {/* Session cards */}
      <div className="flex flex-col gap-3">
        {sessions.length === 0 && !loading && !error && (
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
            No completed sessions yet.
          </p>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/fitness/log/${s.id}`}
            className="growth-in block rounded-md bg-ink-1 hover:bg-ink-2 transition-colors p-6"
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <Mono className="text-[11px] text-ink-3 tracking-[0.15em]">
                {fmtDate(s.date)}
              </Mono>
              <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">
                · {SLOT_ICON[s.slot] ?? "·"} {SLOT_LABEL[s.slot]}
              </span>
              {s.session_type && (
                <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">
                  · {typeLabels[s.session_type] ?? s.session_type}
                </span>
              )}
              <span className="text-base text-ink-4 ml-1 truncate">
                {s.name ?? "Untitled session"}
              </span>
            </div>
            <div className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] mt-1.5">
              {statsLine(s)}
            </div>
            {s.kind === "other" && s.notes && (
              <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1 line-clamp-2">
                {s.notes}
              </p>
            )}
          </Link>
        ))}
      </div>

      {/* Infinite scroll sentinel + status */}
      <div ref={sentinelRef} />
      {loading && (
        <div className="flex items-center justify-center py-4">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-ink-2 border-t-accent animate-spin" />
        </div>
      )}
      {!hasMore && sessions.length > 0 && (
        <p className="text-center text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.18em] py-6">
          — end of history —
        </p>
      )}
    </div>
  );
}
