"use client";
// DRAFT: Schema decision (markers/units/ranges) unresolved.

import { useState } from "react";

type MarkerStatus = "in-range" | "out-of-range";

type BloodMarker = {
  id: string;
  name: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
  date: string;
  status: MarkerStatus;
};

const SAMPLE_MARKERS: BloodMarker[] = [
  { id: "b1", name: "HbA1c", value: 5.2, unit: "%", refLow: 4.0, refHigh: 5.6, date: "2026-05-10", status: "in-range" },
  { id: "b2", name: "Vitamin D", value: 38, unit: "ng/mL", refLow: 30, refHigh: 100, date: "2026-05-10", status: "in-range" },
  { id: "b3", name: "Total Testosterone", value: 22.5, unit: "nmol/L", refLow: 8.6, refHigh: 29.0, date: "2026-05-10", status: "in-range" },
  { id: "b4", name: "TSH", value: 4.8, unit: "mIU/L", refLow: 0.4, refHigh: 4.0, date: "2026-05-10", status: "out-of-range" },
  { id: "b5", name: "Ferritin", value: 45, unit: "ng/mL", refLow: 30, refHigh: 400, date: "2026-05-10", status: "in-range" },
  { id: "b6", name: "Iron", value: 12, unit: "umol/L", refLow: 10, refHigh: 30, date: "2026-05-10", status: "in-range" },
];

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function BloodTestsClient() {
  const [markers] = useState<BloodMarker[]>(SAMPLE_MARKERS);

  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Blood Tests
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          Markers, ranges, and trends.
        </p>
      </header>

      {/* Markers table */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
          Latest Results
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-ink-2">
                {["Marker", "Value", "Unit", "Reference Range", "Date", "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-left p-2 font-normal"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markers.map((m) => (
                <tr key={m.id} className="border-b border-ink-2/50">
                  <td className="p-2 text-ink-4 font-medium">{m.name}</td>
                  <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-4">
                    {m.value}
                  </td>
                  <td className="p-2 text-ink-3">{m.unit}</td>
                  <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-3">
                    {m.refLow} - {m.refHigh}
                  </td>
                  <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-3 text-xs">
                    {formatDate(m.date)}
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${
                        m.status === "in-range"
                          ? "border-ok/40 text-ok bg-ok/10"
                          : "border-warn/40 text-warn bg-warn/10"
                      }`}
                    >
                      {m.status === "in-range" ? "In Range" : "Out of Range"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trend chart placeholders */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
          Trends
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {markers.map((m) => (
            <div
              key={m.id}
              className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-2"
            >
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {m.name}
              </span>
              <div className="h-24 rounded border border-ink-2/50 bg-ink-0 flex items-center justify-center">
                <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                  Trend chart placeholder
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-mono)] tabular-nums text-sm text-ink-4">
                  {m.value} {m.unit}
                </span>
                <span
                  className={`text-[10px] font-[family-name:var(--font-mono)] ${
                    m.status === "in-range" ? "text-ok" : "text-warn"
                  }`}
                >
                  {m.status === "in-range" ? "OK" : "FLAG"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
