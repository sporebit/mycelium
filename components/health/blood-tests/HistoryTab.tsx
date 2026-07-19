"use client";

import { useMemo } from "react";
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
import {
  ACCENT,
  ALL_MARKERS,
  PANEL_ORDER,
  type Session,
  getStatus,
  shortDate,
  statusColour,
} from "@/lib/health/blood-markers";

export function HistoryTab({
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
