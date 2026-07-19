"use client";

import { type BloodTestResult, statusColour } from "@/lib/health/blood-markers";
import { RangeBar } from "./RangeBar";

export function ResultRow({
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
