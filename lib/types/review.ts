export type WeeklyReview = {
  wins: string;
  slipped: string;
  open_loops: string;
  people_followup: string;
  content_shipped: string;
  health_pattern: string;
  next_week_top_3: string;
  sealed_at: string | null;
};

export const REVIEW_FIELDS = [
  "wins",
  "slipped",
  "open_loops",
  "people_followup",
  "content_shipped",
  "health_pattern",
  "next_week_top_3",
] as const;

export type ReviewField = (typeof REVIEW_FIELDS)[number];

export function emptyReview(): WeeklyReview {
  return {
    wins: "",
    slipped: "",
    open_loops: "",
    people_followup: "",
    content_shipped: "",
    health_pattern: "",
    next_week_top_3: "",
    sealed_at: null,
  };
}

export function mergeReview(
  base: WeeklyReview,
  patch: Partial<WeeklyReview>
): WeeklyReview {
  const out: WeeklyReview = { ...base };
  for (const f of REVIEW_FIELDS) {
    const v = patch[f];
    if (typeof v === "string") out[f] = v;
  }
  if (patch.sealed_at !== undefined) {
    out.sealed_at = patch.sealed_at;
  }
  return out;
}
