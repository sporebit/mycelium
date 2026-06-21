"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type DateRange = "all" | "30d" | "90d" | "1y" | "custom";
type Format = "json" | "csv" | "pdf";
type Counts = Record<string, { label: string; count: number }[]>;

const SECTIONS = [
  {
    key: "organisation",
    label: "Organisation",
    sub: "Tasks, captures, people, decisions, purchases",
  },
  {
    key: "fitness",
    label: "Fitness",
    sub: "Sessions, exercises, programmes, workouts",
  },
  {
    key: "health",
    label: "Health",
    sub: "Nutrition logs, body metrics, blood tests, gut health, recipes",
  },
  {
    key: "finance",
    label: "Finance",
    sub: "Transactions, accounts, investments",
  },
  {
    key: "studio",
    label: "Studio",
    sub: "Spotify plays history",
  },
  {
    key: "ventures",
    label: "Ventures",
    sub: "Ventures, steps, ads, inspiration",
  },
  {
    key: "the-boys",
    label: "The Boys",
    sub: "Agent conversations + memory",
  },
];

function dateRangeParams(range: DateRange, customFrom: string, customTo: string) {
  if (range === "all") return undefined;
  const now = new Date();
  if (range === "custom") return { from: customFrom, to: customTo };
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const from = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return { from, to: now.toISOString().slice(0, 10) };
}

export default function ExportPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<Format>("json");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeMeta, setIncludeMeta] = useState(true);
  const [anonymise, setAnonymise] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [exporting, setExporting] = useState(false);

  const toggleSection = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(SECTIONS.map((s) => s.key)));
  const deselectAll = () => setSelected(new Set());

  const loadPreview = useCallback(async () => {
    if (selected.size === 0) { setCounts(null); return; }
    try {
      const r = await fetch("/api/export/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: Array.from(selected),
          dateRange: dateRangeParams(dateRange, customFrom, customTo),
        }),
      });
      if (r.ok) {
        const j = await r.json();
        setCounts(j.counts);
      }
    } catch { /* noop */ }
  }, [selected, dateRange, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPreview();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadPreview]);

  async function doExport() {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: Array.from(selected),
          format,
          dateRange: dateRangeParams(dateRange, customFrom, customTo),
          options: { includeMetadata: includeMeta, anonymise },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert((j as { error?: string }).error || "Export failed");
        return;
      }
      const blob = await r.blob();
      const disposition = r.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? `mycelium-export.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  }

  const totalRows = counts
    ? Object.values(counts)
        .flat()
        .reduce((s, c) => s + c.count, 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Export Your Data
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Select what to export, choose your format, and download your data.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: config */}
        <div className="flex flex-col gap-5">
          {/* Sections */}
          <div className="rounded-md bg-ink-1 p-5">
            <div className="flex items-center justify-between mb-3">
              <Mono className="text-[11px] text-ink-3 tracking-[0.18em]">
                SECTIONS
              </Mono>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[10px] text-accent font-[family-name:var(--font-mono)]"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]"
                >
                  Deselect all
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {SECTIONS.map((s) => (
                <label
                  key={s.key}
                  className="flex items-start gap-3 cursor-pointer py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.key)}
                    onChange={() => toggleSection(s.key)}
                    className="mt-0.5 accent-accent"
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-text-0">{s.label}</div>
                    <div className="text-xs text-ink-3">{s.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="rounded-md bg-ink-1 p-5">
            <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-3">
              FORMAT
            </Mono>
            <div className="flex gap-2">
              {(["json", "csv", "pdf"] as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
                    format === f
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-ink-2 text-ink-3 hover:text-ink-4"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {format === "pdf" && (
              <div className="text-xs text-warn mt-2 italic font-[family-name:var(--font-display)]">
                PDF export coming soon.
              </div>
            )}
          </div>

          {/* Date range */}
          <div className="rounded-md bg-ink-1 p-5">
            <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-3">
              DATE RANGE
            </Mono>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all", label: "All time" },
                  { id: "30d", label: "Last 30 days" },
                  { id: "90d", label: "Last 90 days" },
                  { id: "1y", label: "Last year" },
                  { id: "custom", label: "Custom" },
                ] as { id: DateRange; label: string }[]
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDateRange(d.id)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border transition-colors ${
                    dateRange === d.id
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-ink-2 text-ink-3 hover:text-ink-4"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {dateRange === "custom" && (
              <div className="flex gap-3 mt-3">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
                />
              </div>
            )}
          </div>

          {/* Options */}
          <div className="rounded-md bg-ink-1 p-5">
            <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-3">
              OPTIONS
            </Mono>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMeta}
                  onChange={(e) => setIncludeMeta(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-sm text-text-1">
                  Include metadata (IDs, timestamps)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonymise}
                  onChange={(e) => setAnonymise(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-sm text-text-1">
                  Anonymise personal data
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: preview */}
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-ink-1 p-5 sticky top-20">
            <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-3">
              SUMMARY
            </Mono>
            {selected.size === 0 ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                Select at least one section.
              </div>
            ) : counts ? (
              <div className="flex flex-col gap-2">
                {Object.entries(counts).map(([section, tables]) => (
                  <div key={section}>
                    <div className="text-xs text-text-1 capitalize">
                      {section.replace("-", " ")}
                    </div>
                    {tables.map((t) => (
                      <div
                        key={t.label}
                        className="flex justify-between text-[10px] font-[family-name:var(--font-mono)] text-ink-3 ml-2"
                      >
                        <span>{t.label}</span>
                        <span>{t.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="border-t border-ink-2 pt-2 mt-1 flex justify-between text-xs text-text-0">
                  <span>Total rows</span>
                  <span>{totalRows.toLocaleString()}</span>
                </div>
                <Mono className="text-[9px] text-ink-3 mt-1">
                  Est. ~{Math.max(1, Math.round(totalRows * 0.3))} KB
                </Mono>
              </div>
            ) : (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                Loading preview…
              </div>
            )}

            <button
              type="button"
              onClick={doExport}
              disabled={selected.size === 0 || exporting || format === "pdf"}
              className="w-full mt-4 px-4 py-2.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] disabled:opacity-40 hover:bg-accent/25 transition-colors"
            >
              {exporting ? "EXPORTING…" : "EXPORT NOW"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
