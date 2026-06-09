"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ──

type BloodTestResult = {
  id: string;
  marker_key: string;
  display_name: string;
  panel: string;
  sort_order: number;
  value_raw: string;
  value_numeric: number | null;
  value_prefix: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_direction: string;
  unit: string;
};

type Session = {
  id: string;
  sampled_at: string;
  provider: string;
  notes: string | null;
  results: BloodTestResult[];
};

type ParsedResult = {
  marker_key: string;
  display_name: string;
  value_raw: string;
  value_numeric: number | null;
  value_prefix: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_direction: string;
  unit: string;
};

// ── Constants ──

const ACCENT = "#5de8e0";
const PANEL_ORDER = [
  "Metabolic",
  "Lipids",
  "Thyroid",
  "Vitamins & Nutrients",
  "Liver",
  "Hormones",
];

const ALL_MARKERS = [
  { key: "hba1c", name: "HbA1c", panel: "Metabolic" },
  { key: "crp_hs", name: "CRP (high sensitivity)", panel: "Metabolic" },
  { key: "creatinine", name: "Creatinine", panel: "Metabolic" },
  { key: "egfr", name: "eGFR", panel: "Metabolic" },
  { key: "cholesterol", name: "Cholesterol", panel: "Lipids" },
  { key: "triglycerides", name: "Triglycerides", panel: "Lipids" },
  { key: "hdl_cholesterol", name: "HDL Cholesterol", panel: "Lipids" },
  { key: "ldl_cholesterol", name: "LDL Cholesterol", panel: "Lipids" },
  { key: "non_hdl_cholesterol", name: "Non-HDL Cholesterol", panel: "Lipids" },
  { key: "tc_hdl_ratio", name: "Total Cholesterol/HDL Ratio", panel: "Lipids" },
  { key: "tg_hdl_ratio", name: "Triglyceride/HDL Ratio", panel: "Lipids" },
  { key: "tsh", name: "TSH", panel: "Thyroid" },
  { key: "ft4", name: "Free Thyroxine (FT4)", panel: "Thyroid" },
  { key: "active_b12", name: "Active B12", panel: "Vitamins & Nutrients" },
  { key: "total_b12", name: "Total B12", panel: "Vitamins & Nutrients" },
  { key: "vitamin_d", name: "Vitamin D", panel: "Vitamins & Nutrients" },
  { key: "total_protein", name: "Total Protein", panel: "Vitamins & Nutrients" },
  { key: "albumin", name: "Albumin", panel: "Vitamins & Nutrients" },
  { key: "globulin", name: "Globulin", panel: "Vitamins & Nutrients" },
  { key: "alt", name: "Alanine Transferase (ALT)", panel: "Liver" },
  { key: "alp", name: "Alkaline Phosphatase (ALP)", panel: "Liver" },
  { key: "gamma_gt", name: "Gamma-GT", panel: "Liver" },
  { key: "bilirubin", name: "Bilirubin", panel: "Liver" },
  { key: "shbg", name: "SHBG", panel: "Hormones" },
  { key: "testosterone", name: "Testosterone", panel: "Hormones" },
  { key: "free_androgen_index", name: "Free Androgen Index", panel: "Hormones" },
  { key: "free_testosterone", name: "Free Testosterone", panel: "Hormones" },
];

// ── Helpers ──

function getStatus(r: BloodTestResult): "normal" | "abnormal" | "unquantified" {
  if (r.value_numeric === null) return "unquantified";
  const v = r.value_numeric;
  if (r.ref_direction === "between") {
    const lo = r.ref_min ?? -Infinity;
    const hi = r.ref_max ?? Infinity;
    return v >= lo && v <= hi ? "normal" : "abnormal";
  }
  if (r.ref_direction === "above")
    return v >= (r.ref_min ?? 0) ? "normal" : "abnormal";
  if (r.ref_direction === "below")
    return v <= (r.ref_max ?? Infinity) ? "normal" : "abnormal";
  return "normal";
}

function statusColour(s: "normal" | "abnormal" | "unquantified"): string {
  if (s === "normal") return "var(--color-ok, #4ade80)";
  if (s === "abnormal") return "var(--color-warn, #f59e0b)";
  return "var(--color-ink-3, #888)";
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getTrendArrow(
  current: BloodTestResult,
  prev: BloodTestResult | undefined
): { arrow: string; colour: string } | null {
  if (!prev || current.value_numeric === null || prev.value_numeric === null)
    return null;
  const c = current.value_numeric;
  const p = prev.value_numeric;
  const pct = Math.abs((c - p) / (p || 1));
  if (pct < 0.02) return { arrow: "→", colour: "var(--color-ink-3, #888)" };

  const direction = c > p ? "up" : "down";
  const currentStatus = getStatus(current);

  if (currentStatus === "normal") {
    return {
      arrow: direction === "up" ? "↑" : "↓",
      colour: "var(--color-ink-3, #888)",
    };
  }

  const isMovingTowardNormal = (() => {
    if (current.ref_direction === "between") {
      const mid =
        ((current.ref_min ?? 0) + (current.ref_max ?? 0)) / 2;
      return Math.abs(c - mid) < Math.abs(p - mid);
    }
    if (current.ref_direction === "above") return c > p;
    if (current.ref_direction === "below") return c < p;
    return false;
  })();

  return {
    arrow: direction === "up" ? "↑" : "↓",
    colour: isMovingTowardNormal
      ? "var(--color-ok, #4ade80)"
      : "var(--color-warn, #f59e0b)",
  };
}

// ── Component ──

export default function BloodTestsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"latest" | "history">("latest");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(
    new Set()
  );
  const [historyMarker, setHistoryMarker] = useState("egfr");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/blood-tests")
      .then((r) => r.json())
      .then((j: { sessions?: Session[] }) => {
        if (cancelled) return;
        const s = j.sessions ?? [];
        setSessions(s);
        if (s.length > 0) setSelectedSessionId(s[0].id);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? sessions[0],
    [sessions, selectedSessionId]
  );

  const prevSession = useMemo(() => {
    if (!selected) return undefined;
    const idx = sessions.findIndex((s) => s.id === selected.id);
    return idx >= 0 && idx < sessions.length - 1
      ? sessions[idx + 1]
      : undefined;
  }, [sessions, selected]);

  const togglePanel = (panel: string) => {
    setCollapsedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  };

  const groupedResults = useMemo(() => {
    if (!selected) return [];
    const byPanel = new Map<string, BloodTestResult[]>();
    for (const r of selected.results) {
      const list = byPanel.get(r.panel) ?? [];
      list.push(r);
      byPanel.set(r.panel, list);
    }
    return PANEL_ORDER.filter((p) => byPanel.has(p)).map((panel) => {
      const results = byPanel.get(panel)!;
      results.sort((a, b) => {
        const sa = getStatus(a) === "abnormal" ? 0 : 1;
        const sb = getStatus(b) === "abnormal" ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.sort_order - b.sort_order;
      });
      return { panel, results };
    });
  }, [selected]);

  const reloadSessions = useCallback(async () => {
    const r = await fetch("/api/health/blood-tests");
    const j = (await r.json()) as { sessions?: Session[] };
    const s = j.sessions ?? [];
    setSessions(s);
    if (s.length > 0 && !s.find((x) => x.id === selectedSessionId)) {
      setSelectedSessionId(s[0].id);
    }
  }, [selectedSessionId]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-ink-4">
            Blood Tests
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Markers, ranges, and trends across sessions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sessions.length > 1 && (
            <select
              value={selectedSessionId ?? ""}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.sampled_at)} — {s.provider}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="shrink-0 px-3 py-1.5 rounded-md border border-ink-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 font-[family-name:var(--font-mono)] transition-colors"
          >
            Add results
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-ink-2">
        {(["latest", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors border-b-2 -mb-px ${
              tab === t
                ? "text-ink-4 border-current"
                : "text-ink-3 border-transparent hover:text-ink-4"
            }`}
            style={tab === t ? { borderColor: ACCENT } : undefined}
          >
            {t === "latest" ? "Latest Results" : "History"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading blood tests…
        </div>
      )}

      {/* Tab: Latest Results */}
      {!loading && tab === "latest" && selected && (
        <div className="flex flex-col gap-4">
          {groupedResults.map(({ panel, results }) => {
            const collapsed = collapsedPanels.has(panel);
            return (
              <section key={panel}>
                <button
                  type="button"
                  onClick={() => togglePanel(panel)}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                    {collapsed ? "▶" : "▼"}
                  </span>
                  <h3 className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {panel}
                  </h3>
                  <span className="text-[10px] text-ink-3/60 font-[family-name:var(--font-mono)]">
                    {results.filter((r) => getStatus(r) === "abnormal").length >
                    0
                      ? `${results.filter((r) => getStatus(r) === "abnormal").length} flagged`
                      : "all normal"}
                  </span>
                </button>
                {!collapsed && (
                  <div className="rounded-md border border-ink-2 overflow-hidden">
                    {results.map((r) => {
                      const status = getStatus(r);
                      const prevResult = prevSession?.results.find(
                        (pr) => pr.marker_key === r.marker_key
                      );
                      const trend = getTrendArrow(r, prevResult);
                      return (
                        <ResultRow
                          key={r.marker_key}
                          result={r}
                          status={status}
                          trend={trend}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {groupedResults.length === 0 && (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
              No results in this session.
            </p>
          )}
        </div>
      )}

      {/* Tab: History */}
      {!loading && tab === "history" && (
        <HistoryTab
          sessions={sessions}
          historyMarker={historyMarker}
          onMarkerChange={setHistoryMarker}
        />
      )}

      {/* Add Results Modal */}
      {showAddModal && (
        <AddResultsModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            void reloadSessions();
          }}
        />
      )}
    </div>
  );
}

// ── Result Row ──

function ResultRow({
  result: r,
  status,
  trend,
}: {
  result: BloodTestResult;
  status: "normal" | "abnormal" | "unquantified";
  trend: { arrow: string; colour: string } | null;
}) {
  return (
    <div className="grid grid-cols-[1fr_100px_120px_32px_24px] sm:grid-cols-[1fr_100px_140px_32px_24px] items-center px-4 py-2.5 border-b border-ink-2/40 last:border-b-0 gap-2">
      {/* Name */}
      <div className="text-sm text-ink-4 truncate">{r.display_name}</div>
      {/* Value + unit */}
      <div className="font-[family-name:var(--font-mono)] tabular-nums text-sm text-ink-4 text-right">
        {r.value_prefix && (
          <span className="text-ink-3 italic text-xs">{r.value_prefix}</span>
        )}
        {r.value_numeric !== null ? r.value_numeric : r.value_raw}{" "}
        <span className="text-ink-3 text-xs">{r.unit}</span>
      </div>
      {/* Range bar */}
      <div className="flex items-center justify-center">
        {r.ref_direction === "between" &&
        r.ref_min !== null &&
        r.ref_max !== null ? (
          <RangeBar
            value={r.value_numeric}
            min={r.ref_min}
            max={r.ref_max}
            status={status}
          />
        ) : (
          <span
            className="text-[10px] font-[family-name:var(--font-mono)] tabular-nums text-ink-3"
          >
            {r.ref_direction === "above" && r.ref_min !== null
              ? `≥ ${r.ref_min}`
              : r.ref_direction === "below" && r.ref_max !== null
                ? `≤ ${r.ref_max}`
                : "—"}
          </span>
        )}
      </div>
      {/* Trend arrow */}
      <div className="text-center text-sm font-[family-name:var(--font-mono)]">
        {trend ? (
          <span style={{ color: trend.colour }}>{trend.arrow}</span>
        ) : (
          <span className="text-ink-3/30">—</span>
        )}
      </div>
      {/* Status dot */}
      <div className="flex justify-center">
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: statusColour(status),
          }}
        />
      </div>
    </div>
  );
}

// ── Range Bar ──

function RangeBar({
  value,
  min,
  max,
  status,
}: {
  value: number | null;
  min: number;
  max: number;
  status: "normal" | "abnormal" | "unquantified";
}) {
  if (value === null) {
    return (
      <div
        className="rounded-full bg-ink-2/50"
        style={{ width: 120, height: 4 }}
      />
    );
  }

  const range = max - min;
  const padding = range * 0.2;
  const trackMin = min - padding;
  const trackMax = max + padding;
  const trackRange = trackMax - trackMin;

  const refStart = ((min - trackMin) / trackRange) * 100;
  const refWidth = ((max - min) / trackRange) * 100;
  let dotPos = ((value - trackMin) / trackRange) * 100;
  dotPos = Math.max(2, Math.min(98, dotPos));

  return (
    <div
      className="relative"
      style={{ width: 120, height: 12 }}
      title={`${value} (range: ${min}–${max})`}
    >
      {/* Track */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-ink-2/40"
        style={{ left: 0, right: 0, height: 4 }}
      />
      {/* Reference range (green zone) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${refStart}%`,
          width: `${refWidth}%`,
          height: 4,
          backgroundColor: "rgba(74, 222, 128, 0.25)",
        }}
      />
      {/* Value dot */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${dotPos}%`,
          width: 8,
          height: 8,
          marginLeft: -4,
          backgroundColor: statusColour(status),
        }}
      />
    </div>
  );
}

// ── History Tab ──

function HistoryTab({
  sessions,
  historyMarker,
  onMarkerChange,
}: {
  sessions: Session[];
  historyMarker: string;
  onMarkerChange: (key: string) => void;
}) {
  const data = useMemo(() => {
    const reversed = [...sessions].reverse();
    return reversed
      .map((s) => {
        const r = s.results.find((x) => x.marker_key === historyMarker);
        if (!r || r.value_numeric === null) return null;
        return {
          date: s.sampled_at,
          label: shortDate(s.sampled_at),
          value: r.value_numeric,
          ref_min: r.ref_min,
          ref_max: r.ref_max,
          ref_direction: r.ref_direction,
          status: getStatus(r),
          unit: r.unit,
        };
      })
      .filter(Boolean) as {
      date: string;
      label: string;
      value: number;
      ref_min: number | null;
      ref_max: number | null;
      ref_direction: string;
      status: "normal" | "abnormal" | "unquantified";
      unit: string;
    }[];
  }, [sessions, historyMarker]);

  const markerInfo = ALL_MARKERS.find((m) => m.key === historyMarker);
  const unit = data.length > 0 ? data[0].unit : "";
  const refMin = data.length > 0 ? data[0].ref_min : null;
  const refMax = data.length > 0 ? data[0].ref_max : null;

  const yMin = useMemo(() => {
    const vals = data.map((d) => d.value);
    if (refMin !== null) vals.push(refMin);
    return vals.length > 0 ? Math.floor(Math.min(...vals) * 0.9) : 0;
  }, [data, refMin]);

  const yMax = useMemo(() => {
    const vals = data.map((d) => d.value);
    if (refMax !== null) vals.push(refMax);
    return vals.length > 0 ? Math.ceil(Math.max(...vals) * 1.1) : 100;
  }, [data, refMax]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Marker
        </label>
        <select
          value={historyMarker}
          onChange={(e) => onMarkerChange(e.target.value)}
          className="bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
        >
          {PANEL_ORDER.map((panel) => (
            <optgroup key={panel} label={panel}>
              {ALL_MARKERS.filter((m) => m.panel === panel).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
          No data for {markerInfo?.name ?? historyMarker}.
        </p>
      ) : (
        <div className="rounded-md border border-ink-2 p-4 bg-ink-0/40">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
            {markerInfo?.name ?? historyMarker} ({unit})
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-ink-3, #888)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 10, fill: "var(--color-ink-3, #888)" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              {refMin !== null && refMax !== null && (
                <ReferenceArea
                  y1={refMin}
                  y2={refMax}
                  fill="rgba(74, 222, 128, 0.08)"
                  strokeOpacity={0}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "var(--color-ink-1, #1a1a1a)",
                  border: "1px solid var(--color-ink-2, #333)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-ink-4, #eee)" }}
                formatter={(val: unknown) => [`${val} ${unit}`, markerInfo?.name ?? historyMarker]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={ACCENT}
                strokeWidth={2}
                dot={(props: Record<string, unknown>) => {
                  const { cx, cy, payload } = props as {
                    cx: number;
                    cy: number;
                    payload: { status: string };
                  };
                  return (
                    <circle
                      key={`${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={statusColour(payload.status as "normal" | "abnormal" | "unquantified")}
                      stroke="none"
                    />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          {refMin !== null && refMax !== null && (
            <div className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
              Reference range: {refMin}–{refMax} {unit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Results Modal ──

function AddResultsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"pdf" | "manual">("pdf");
  const [uploading, setUploading] = useState(false);
  const [parsedResults, setParsedResults] = useState<ParsedResult[] | null>(
    null
  );
  const [parsedDate, setParsedDate] = useState("");
  const [parsedProvider, setParsedProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry state
  const [manualDate, setManualDate] = useState("");
  const [manualProvider, setManualProvider] = useState("Thriva");
  const [manualValues, setManualValues] = useState<
    Record<string, string>
  >({});

  async function handlePdfUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/health/blood-tests/parse", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Parse failed");
      const j = (await res.json()) as {
        parsed?: {
          sampled_at?: string;
          provider?: string;
          results?: ParsedResult[];
        };
      };
      if (!j.parsed?.results) throw new Error("No results parsed");
      setParsedResults(j.parsed.results);
      setParsedDate(j.parsed.sampled_at ?? "");
      setParsedProvider(j.parsed.provider ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveResults(
    date: string,
    provider: string,
    results: {
      marker_key: string;
      value_raw: string;
      value_numeric: number | null;
      value_prefix: string | null;
      ref_min: number | null;
      ref_max: number | null;
      ref_direction: string;
      unit: string;
    }[]
  ) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/health/blood-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampled_at: date,
          provider,
          results,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleManualSave() {
    if (!manualDate) {
      setError("Date is required");
      return;
    }
    const results: {
      marker_key: string;
      value_raw: string;
      value_numeric: number | null;
      value_prefix: string | null;
      ref_min: number | null;
      ref_max: number | null;
      ref_direction: string;
      unit: string;
    }[] = [];

    for (const m of ALL_MARKERS) {
      const raw = manualValues[m.key]?.trim();
      if (!raw) continue;

      let prefix: string | null = null;
      let numStr = raw;
      if (raw.startsWith("<") || raw.startsWith(">")) {
        prefix = raw[0];
        numStr = raw.slice(1);
      }
      const num = parseFloat(numStr);

      results.push({
        marker_key: m.key,
        value_raw: raw,
        value_numeric: Number.isFinite(num) ? num : null,
        value_prefix: prefix,
        ref_min: null,
        ref_max: null,
        ref_direction: "between",
        unit: "",
      });
    }

    if (results.length === 0) {
      setError("Enter at least one marker value");
      return;
    }

    void saveResults(manualDate, manualProvider, results);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh] overflow-y-auto">
      <div className="bg-ink-1 border border-ink-2 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-2">
          <h2 className="text-lg font-[family-name:var(--font-display)] italic text-ink-4">
            Add Results
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-0 border-b border-ink-2 px-5">
          {(["pdf", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors border-b-2 -mb-px ${
                mode === m
                  ? "text-ink-4 border-current"
                  : "text-ink-3 border-transparent hover:text-ink-4"
              }`}
              style={mode === m ? { borderColor: ACCENT } : undefined}
            >
              {m === "pdf" ? "Upload PDF" : "Enter manually"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 text-sm text-warn font-[family-name:var(--font-mono)] bg-warn/10 border border-warn/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {mode === "pdf" && !parsedResults && (
            <div className="flex flex-col items-center gap-4 py-8">
              {uploading ? (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                  Parsing PDF…
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-3">
                    Upload a blood test results PDF to extract markers
                    automatically.
                  </p>
                  <label className="cursor-pointer px-4 py-2 rounded-md border border-ink-2 text-sm text-ink-4 hover:border-ink-3 transition-colors font-[family-name:var(--font-mono)]">
                    Choose PDF
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePdfUpload(f);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {mode === "pdf" && parsedResults && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={parsedDate}
                    onChange={(e) => setParsedDate(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Provider
                  </label>
                  <input
                    type="text"
                    value={parsedProvider}
                    onChange={(e) => setParsedProvider(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-2">
                {parsedResults.length} markers extracted — review before saving
              </div>
              <div className="rounded-md border border-ink-2 overflow-hidden max-h-[40vh] overflow-y-auto">
                <div className="grid grid-cols-[1fr_80px_80px] gap-0 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] bg-ink-0/40 px-3 py-2 border-b border-ink-2 sticky top-0">
                  <span>Marker</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">Unit</span>
                </div>
                {parsedResults.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_80px_80px] gap-0 items-center px-3 py-2 border-b border-ink-2/40 last:border-b-0"
                  >
                    <span className="text-sm text-ink-4 truncate">
                      {r.display_name}
                    </span>
                    <input
                      type="text"
                      value={r.value_raw}
                      onChange={(e) => {
                        const next = [...parsedResults];
                        next[i] = { ...next[i], value_raw: e.target.value };
                        const raw = e.target.value.trim();
                        let prefix: string | null = null;
                        let numStr = raw;
                        if (raw.startsWith("<") || raw.startsWith(">")) {
                          prefix = raw[0];
                          numStr = raw.slice(1);
                        }
                        const num = parseFloat(numStr);
                        next[i].value_numeric = Number.isFinite(num)
                          ? num
                          : null;
                        next[i].value_prefix = prefix;
                        setParsedResults(next);
                      }}
                      className="bg-ink-0 border border-ink-2 rounded px-1.5 py-1 text-sm text-ink-4 font-[family-name:var(--font-mono)] tabular-nums text-right"
                    />
                    <span className="text-xs text-ink-3 text-right font-[family-name:var(--font-mono)]">
                      {r.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "manual" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Provider
                  </label>
                  <input
                    type="text"
                    value={manualProvider}
                    onChange={(e) => setManualProvider(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-2">
                Enter values — leave blank to skip
              </div>
              <div className="rounded-md border border-ink-2 overflow-hidden max-h-[40vh] overflow-y-auto">
                {PANEL_ORDER.map((panel) => (
                  <div key={panel}>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3/60 font-[family-name:var(--font-mono)] bg-ink-0/40 px-3 py-1.5 border-b border-ink-2 sticky top-0">
                      {panel}
                    </div>
                    {ALL_MARKERS.filter((m) => m.panel === panel).map((m) => (
                      <div
                        key={m.key}
                        className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-1.5 border-b border-ink-2/40 last:border-b-0"
                      >
                        <span className="text-sm text-ink-4">{m.name}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={manualValues[m.key] ?? ""}
                          onChange={(e) =>
                            setManualValues((prev) => ({
                              ...prev,
                              [m.key]: e.target.value,
                            }))
                          }
                          className="bg-ink-0 border border-ink-2 rounded px-1.5 py-1 text-sm text-ink-4 font-[family-name:var(--font-mono)] tabular-nums text-right"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-ink-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-ink-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] transition-colors"
          >
            Cancel
          </button>
          {mode === "pdf" && parsedResults && (
            <button
              type="button"
              disabled={saving || !parsedDate}
              onClick={() => {
                void saveResults(
                  parsedDate,
                  parsedProvider,
                  parsedResults.map((r) => ({
                    marker_key: r.marker_key,
                    value_raw: r.value_raw,
                    value_numeric: r.value_numeric,
                    value_prefix: r.value_prefix,
                    ref_min: r.ref_min,
                    ref_max: r.ref_max,
                    ref_direction: r.ref_direction,
                    unit: r.unit,
                  }))
                );
              }}
              className="px-4 py-1.5 rounded-md text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors disabled:opacity-50"
              style={{ backgroundColor: ACCENT, color: "#000" }}
            >
              {saving ? "Saving…" : "Save results"}
            </button>
          )}
          {mode === "manual" && (
            <button
              type="button"
              disabled={saving}
              onClick={handleManualSave}
              className="px-4 py-1.5 rounded-md text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors disabled:opacity-50"
              style={{ backgroundColor: ACCENT, color: "#000" }}
            >
              {saving ? "Saving…" : "Save results"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
