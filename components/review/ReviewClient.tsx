"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import {
  REVIEW_FIELDS,
  emptyReview,
  type ReviewField,
  type WeeklyReview,
} from "@/lib/types/review";

type ReviewMeta = {
  iso_year: number;
  iso_week: number;
  week_start: string; // Monday YYYY-MM-DD
  week_end: string; // Sunday YYYY-MM-DD
};

type ArchiveEntry = {
  iso_year: number;
  iso_week: number;
  sunday_key: string;
  sealed_at: string;
};

const FIELD_LABELS: Record<ReviewField, string> = {
  wins: "Wins this week",
  slipped: "What slipped",
  open_loops: "Open loops",
  people_followup: "People to follow up with",
  content_shipped: "Content shipped",
  health_pattern: "Health pattern",
  next_week_top_3: "Next week — Top 3",
};

const FIELD_GRID: ReviewField[] = [
  "wins",
  "slipped",
  "open_loops",
  "people_followup",
  "content_shipped",
  "health_pattern",
];

const AUTOSAVE_DEBOUNCE_MS = 1000;

function fmtDateRange(monday: string, sunday: string): string {
  const m = new Date(monday + "T00:00:00");
  const s = new Date(sunday + "T00:00:00");
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      ...(withMonth ? { month: "short" } : {}),
    });
  const sameMonth = m.getMonth() === s.getMonth();
  return `Mon ${fmt(m, !sameMonth)} → Sun ${fmt(s, true)}`;
}

function fmtSavedRelative(ms: number | null): string {
  if (ms === null) return "—";
  const ageS = Math.floor((Date.now() - ms) / 1000);
  if (ageS < 5) return "just now";
  if (ageS < 60) return `${ageS}s ago`;
  const m = Math.floor(ageS / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function ReviewClient({
  initialIsoWeek,
}: {
  initialIsoWeek?: string;
}) {
  const router = useRouter();
  const [review, setReview] = useState<WeeklyReview>(emptyReview());
  const [meta, setMeta] = useState<ReviewMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savingField, setSavingField] = useState<ReviewField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[] | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const debouncers = useRef<Map<ReviewField, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const archiveRef = useRef<HTMLDivElement | null>(null);
  const isPast = !!initialIsoWeek;

  useEffect(() => {
    let mounted = true;
    const url = initialIsoWeek
      ? `/api/review/${encodeURIComponent(initialIsoWeek)}`
      : "/api/review/current";
    fetch(url)
      .then((r) => r.json())
      .then(
        (j: {
          review?: WeeklyReview;
          iso_year?: number;
          iso_week?: number;
          week_start?: string;
          week_end?: string;
        }) => {
          if (!mounted) return;
          if (j.review) setReview(j.review);
          if (
            typeof j.iso_year === "number" &&
            typeof j.iso_week === "number" &&
            j.week_start &&
            j.week_end
          ) {
            setMeta({
              iso_year: j.iso_year,
              iso_week: j.iso_week,
              week_start: j.week_start,
              week_end: j.week_end,
            });
          }
          setLoaded(true);
        }
      )
      .catch(() => {
        if (mounted) {
          setError("Failed to load review");
          setLoaded(true);
        }
      });
    const timers = debouncers.current;
    return () => {
      mounted = false;
      // Cleanup any pending debounce timers — capture the ref locally per
      // the react-hooks/exhaustive-deps guidance.
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [initialIsoWeek]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  // Close archive dropdown on outside click
  useEffect(() => {
    if (!archiveOpen) return;
    function onDoc(e: MouseEvent) {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) {
        setArchiveOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [archiveOpen]);

  async function loadArchive() {
    if (archive !== null) return;
    try {
      const r = await fetch("/api/review/archive");
      const j = (await r.json()) as { entries?: ArchiveEntry[] };
      setArchive(Array.isArray(j.entries) ? j.entries : []);
    } catch {
      setArchive([]);
    }
  }

  function isoWeekKey(year: number, week: number): string {
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  function scheduleSave(field: ReviewField, value: string) {
    if (isPast || review.sealed_at) return;
    const existing = debouncers.current.get(field);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void persist(field, value);
    }, AUTOSAVE_DEBOUNCE_MS);
    debouncers.current.set(field, timer);
  }

  async function persist(field: ReviewField, value: string) {
    setSavingField(field);
    try {
      const res = await fetch("/api/review/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Save failed (${res.status})`);
        return;
      }
      // eslint-disable-next-line react-hooks/purity -- timestamp captured inside async callback, not render
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingField((cur) => (cur === field ? null : cur));
    }
  }

  function onChange(field: ReviewField, value: string) {
    setReview((cur) => ({ ...cur, [field]: value }));
    scheduleSave(field, value);
  }

  function onBlur(field: ReviewField) {
    // Force save immediately on blur (cancel debounce, save now)
    const existing = debouncers.current.get(field);
    if (existing) clearTimeout(existing);
    if (isPast || review.sealed_at) return;
    void persist(field, review[field] as string);
  }

  async function seal() {
    if (isPast) return;
    // Flush any pending saves first
    for (const t of debouncers.current.values()) clearTimeout(t);
    debouncers.current.clear();
    try {
      // Save all fields synchronously by PATCHing the full set
      const fullPatch: Partial<WeeklyReview> = {};
      for (const f of REVIEW_FIELDS) fullPatch[f] = review[f] as string;
      await fetch("/api/review/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      });

      const res = await fetch("/api/review/current/seal", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        review?: WeeklyReview;
        error?: string;
      };
      if (!res.ok || !j.review) {
        setError(j.error ?? `Seal failed (${res.status})`);
        return;
      }
      setReview(j.review);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seal failed");
    }
  }

  async function unseal() {
    if (isPast) return;
    try {
      const res = await fetch("/api/review/current/unseal", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        review?: WeeklyReview;
        error?: string;
      };
      if (!res.ok || !j.review) {
        setError(j.error ?? `Unseal failed (${res.status})`);
        return;
      }
      setReview(j.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unseal failed");
    }
  }

  const sealed = !!review.sealed_at;
  const locked = sealed || isPast;
  const weekLabel = meta
    ? `W${String(meta.iso_week).padStart(2, "0")}`
    : "—";
  const rangeLabel = meta
    ? fmtDateRange(meta.week_start, meta.week_end)
    : "—";

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Weekly Review · {weekLabel}
            {isPast && (
              <span className="ml-2 text-warn">· READ-ONLY</span>
            )}
          </h1>
          <div className="mt-1 text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
            {rangeLabel}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!isPast && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center gap-2">
              {savingField ? (
                <>
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse"
                  />
                  Saving…
                </>
              ) : sealed ? (
                <>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                  Sealed
                </>
              ) : (
                <>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                  Auto-saved <Mono className="text-ink-3">{fmtSavedRelative(savedAt)}</Mono>
                </>
              )}
            </div>
          )}

          {/* Past reviews dropdown */}
          <div ref={archiveRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setArchiveOpen((o) => !o);
                void loadArchive();
              }}
              className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              ‹ PAST REVIEWS
            </button>
            {archiveOpen && (
              <div className="absolute top-full mt-1 right-0 z-30 w-64 rounded-lg border border-ink-2 bg-ink-1 shadow-2xl max-h-72 overflow-y-auto">
                {archive === null ? (
                  <div className="px-3 py-2 text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                    Loading…
                  </div>
                ) : archive.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                    No sealed reviews yet.
                  </div>
                ) : (
                  <ul className="py-1">
                    {archive.map((a) => (
                      <li key={a.sunday_key}>
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveOpen(false);
                            router.push(
                              `/review/${isoWeekKey(a.iso_year, a.iso_week)}`
                            );
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm text-ink-4 hover:bg-ink-2 transition-colors flex items-center justify-between gap-2"
                        >
                          <span>
                            {a.iso_year}-W{String(a.iso_week).padStart(2, "0")}
                          </span>
                          <Mono className="text-[10px] text-ink-3">
                            {a.sunday_key}
                          </Mono>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {!isPast && !sealed && (
            <button
              type="button"
              onClick={seal}
              className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
            >
              SEAL WEEK
            </button>
          )}
          {!isPast && sealed && (
            <button
              type="button"
              onClick={unseal}
              className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
            >
              ✎ Edit again
            </button>
          )}
          {isPast && (
            <Link
              href="/review"
              className="px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              ← THIS WEEK
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {!loaded ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELD_GRID.map((field) => (
              <ReviewField
                key={field}
                field={field}
                label={FIELD_LABELS[field]}
                value={review[field] as string}
                locked={locked}
                onChange={(v) => onChange(field, v)}
                onBlur={() => onBlur(field)}
              />
            ))}
          </div>

          <ReviewField
            field="next_week_top_3"
            label={FIELD_LABELS.next_week_top_3}
            value={review.next_week_top_3}
            locked={locked}
            onChange={(v) => onChange("next_week_top_3", v)}
            onBlur={() => onBlur("next_week_top_3")}
            tall
          />
        </>
      )}
    </div>
  );
}

function ReviewField({
  label,
  value,
  locked,
  onChange,
  onBlur,
  tall,
}: {
  field: ReviewField;
  label: string;
  value: string;
  locked: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  tall?: boolean;
}) {
  return (
    <div className="rounded-xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl p-4 flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={locked}
        rows={tall ? 6 : 5}
        placeholder={locked ? "" : "—"}
        className="w-full flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3 resize-y leading-relaxed disabled:cursor-default disabled:opacity-90"
      />
    </div>
  );
}
