// Blood test data + pure helpers shared across the blood-tests surface.
// Data literals (PANEL_ORDER, ALL_MARKERS) are canonical — kept out of
// components so the page splits (ResultRow / RangeBar / HistoryTab /
// AddResultsModal) all reference one source of truth.

export type BloodTestResult = {
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

export type Session = {
  id: string;
  sampled_at: string;
  provider: string;
  notes: string | null;
  results: BloodTestResult[];
};

export type ParsedResult = {
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

export const ACCENT = "#5de8e0";

export const PANEL_ORDER = [
  "Metabolic",
  "Lipids",
  "Thyroid",
  "Vitamins & Nutrients",
  "Liver",
  "Hormones",
];

export const ALL_MARKERS = [
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

export function getStatus(
  r: BloodTestResult,
): "normal" | "abnormal" | "unquantified" {
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

export function statusColour(
  s: "normal" | "abnormal" | "unquantified",
): string {
  if (s === "normal") return "var(--color-ok, #4ade80)";
  if (s === "abnormal") return "var(--color-warn, #f59e0b)";
  return "var(--color-ink-3, #888)";
}

export function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function getTrendArrow(
  current: BloodTestResult,
  prev: BloodTestResult | undefined,
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
      const mid = ((current.ref_min ?? 0) + (current.ref_max ?? 0)) / 2;
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
