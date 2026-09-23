"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import { SuggestCapture } from "./SuggestCapture";

type Capture = {
  id: string;
  source: string;
  raw_text: string | null;
  audio_url: string | null;
  classification: Record<string, unknown> | null;
  llm_source: string | null;
  routed_to: string | null;
  routed_id: string | null;
  created_at: string;
};

const SOURCES = [
  { id: "all", label: "ALL" },
  { id: "telegram", label: "TELEGRAM" },
  { id: "web", label: "WEB" },
];

function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 14) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function sourceIcon(s: string): string {
  if (s === "telegram") return "✈";
  if (s === "web") return "▢";
  if (s === "api") return "⚡";
  return "·";
}

/**
 * A list of captures of one kind that live only as captures (decisions,
 * ideas): filter by source, expand, delete. Ideas (MYC-156) reuse it until
 * the Ideas spec gives them a surface of their own.
 */
export function DecisionsClient({
  kind = "decision",
  label = "Decision",
  plural = "decisions",
  badgeClass = "bg-warn/15 text-warn border-warn/40",
}: {
  kind?: string;
  label?: string;
  plural?: string;
  badgeClass?: string;
} = {}) {
  const [source, setSource] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // The SWR key is the raw path, so changing the source filter selects a
  // different cache entry rather than clobbering the current one.
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  params.set("kind", kind);
  params.set("limit", "100");
  const { data, error, mutate } = useApi<{ captures?: Capture[] }>(
    `/api/captures?${params.toString()}`,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Soft-delete (MYC-151): the row leaves the list at once; the request runs behind it. */
  async function remove(c: Capture) {
    if (deleting) return;
    if (!confirm(`Delete this ${label.toLowerCase()}?\n\n${truncate(c.raw_text, 120)}`)) return;
    setDeleting(c.id);
    const optimistic = { captures: (data?.captures ?? []).filter((x) => x.id !== c.id) };
    try {
      await mutate(
        async () => {
          const r = await fetch(`/api/captures/${c.id}`, { method: "DELETE" });
          if (!r.ok) throw new Error(`${r.status}`);
          return optimistic;
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: true },
      );
    } catch {
      setNotice("Delete failed");
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setDeleting(null);
    }
  }
  // null while loading; [] on failure — same contract the old effect had.
  const decisions = useMemo<Capture[] | null>(() => {
    if (error) return [];
    if (!data) return null;
    return Array.isArray(data.captures) ? data.captures : [];
  }, [data, error]);

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="card-eyebrow">{plural[0].toUpperCase() + plural.slice(1)}</div>
        <Mono className={`text-[10px] ${notice ? "text-danger" : "text-ink-3"}`}>
          {notice ?? (decisions === null ? "…" : `${decisions.length} ${decisions.length === 1 ? label.toLowerCase() : plural}`)}
        </Mono>
      </div>

      <div className="flex items-center gap-4">
        <FilterGroup
          label="Source"
          options={SOURCES}
          value={source}
          onChange={setSource}
        />
      </div>

      {decisions === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No {plural} logged yet. Capture one below — the classifier will route it as {label.toLowerCase() === "idea" ? "an" : "a"} {label.toLowerCase()}.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-2 rounded-xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl overflow-hidden">
          {decisions.map((c) => {
            const isOpen = expanded.has(c.id);
            return (
              <li key={c.id} className="growth-in group">
                <div className="flex items-start gap-3 px-4 py-3 hover:bg-ink-2/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex-1 min-w-0 text-left flex items-start gap-3"
                  >
                    <span
                      aria-hidden
                      className="text-ink-3 text-base w-5 shrink-0 mt-0.5"
                      title={c.source}
                    >
                      {sourceIcon(c.source)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Mono className="text-[10px] text-ink-3">
                          {relativeDate(c.created_at)}
                        </Mono>
                        <span className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${badgeClass}`}>
                          {label.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-ink-4 mt-1 leading-snug break-words">
                        {isOpen ? c.raw_text : truncate(c.raw_text, 200)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={deleting === c.id}
                    aria-label={`Delete ${label.toLowerCase()}`}
                    title="Delete"
                    className="shrink-0 mt-0.5 px-2 py-1 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 disabled:opacity-40 text-xs transition-colors opacity-60 group-hover:opacity-100"
                  >
                    {deleting === c.id ? "…" : "✕"}
                  </button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-3">
                    <details className="rounded-md border border-ink-2 bg-ink-0/40 p-2">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                        Classification JSON
                      </summary>
                      <pre className="mt-2 text-[11px] text-ink-3 overflow-x-auto font-[family-name:var(--font-mono)]">
                        {JSON.stringify(c.classification, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="max-w-2xl w-full mx-auto pt-2">
        <SuggestCapture label={label} prefix={`[${kind}]`} />
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      <div className="inline-flex rounded-lg border border-ink-2 bg-ink-0/40 p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-2 py-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
              value === o.id
                ? "bg-ink-2 text-ink-4"
                : "text-ink-3 hover:text-ink-4"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
