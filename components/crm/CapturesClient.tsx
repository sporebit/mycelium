"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

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

const KINDS = [
  { id: "all", label: "ALL" },
  { id: "task", label: "TASK" },
  { id: "note", label: "NOTE" },
  { id: "decision", label: "DECISION" },
  { id: "capture", label: "CAPTURE" },
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

function kindBadge(kind: string | undefined): { label: string; className: string } {
  if (kind === "task")
    return { label: "TASK", className: "bg-accent/15 text-accent border-accent/40" };
  if (kind === "decision")
    return { label: "DECISION", className: "bg-warn/15 text-warn border-warn/40" };
  if (kind === "note")
    return { label: "NOTE", className: "bg-ink-2 text-ink-4 border-ink-2" };
  return {
    label: (kind ?? "CAPTURE").toUpperCase(),
    className: "bg-ink-2 text-ink-3 border-ink-2",
  };
}

export function CapturesClient() {
  const [source, setSource] = useState("all");
  const [kind, setKind] = useState("all");
  const [captures, setCaptures] = useState<Capture[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let mounted = true;
    const p = new URLSearchParams();
    if (source !== "all") p.set("source", source);
    if (kind !== "all") p.set("kind", kind);
    p.set("limit", "100");

    fetch(`/api/captures?${p.toString()}`)
      .then((r) => r.json())
      .then((j: { captures?: Capture[] }) => {
        if (!mounted) return;
        setCaptures(Array.isArray(j?.captures) ? j.captures : []);
      })
      .catch(() => mounted && setCaptures([]));
    return () => {
      mounted = false;
    };
  }, [source, kind]);

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
      <div className="flex items-center gap-4">
        <FilterGroup
          label="Source"
          options={SOURCES}
          value={source}
          onChange={setSource}
        />
        <FilterGroup
          label="Kind"
          options={KINDS}
          value={kind}
          onChange={setKind}
        />
        <div className="flex-1" />
        <Mono className="text-[10px] text-ink-3">
          {captures === null ? "…" : `${captures.length} CAPTURES`}
        </Mono>
      </div>

      {captures === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : captures.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No captures match these filters.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-2 rounded-xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl overflow-hidden">
          {captures.map((c) => {
            const isOpen = expanded.has(c.id);
            const cls = c.classification ?? {};
            const kindStr = typeof cls.kind === "string" ? cls.kind : undefined;
            const badge = kindBadge(kindStr);
            return (
              <li key={c.id} className="growth-in">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-ink-2/30 transition-colors flex items-start gap-3"
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
                      <span
                        className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-sm text-ink-4 mt-1 leading-snug break-words">
                      {isOpen ? c.raw_text : truncate(c.raw_text, 200)}
                    </div>
                  </div>
                </button>
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
