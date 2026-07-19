export type Venture = {
  id: string;
  name: string;
  tagline: string | null;
  parent_id: string | null;
  kind: string;
  status: string;
  description: string | null;
  problem: string | null;
  target_market: string | null;
  mvp: string | null;
  revenue_model: string | null;
  pricing_notes: string | null;
  cost_estimate_monthly: number | null;
  cost_estimate_setup: number | null;
  revenue_projection_monthly: number | null;
  brand_notes: string | null;
  competitors: string | null;
  website_url: string | null;
  accent_colour: string;
};

export type Step = {
  id: string;
  venture_id: string;
  title: string;
  description: string | null;
  status: string;
  linked_task_id: string | null;
  sort_order: number;
};

export type Ad = {
  id: string;
  venture_id: string;
  platform: string;
  campaign_name: string | null;
  headline: string | null;
  body_copy: string | null;
  media_url: string | null;
  media_type: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_spent: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  roas: number | null;
  notes: string | null;
};

export type VentureTab = "overview" | "plan" | "steps" | "ads" | "notes";

export const STATUS_OPTIONS = [
  "idea",
  "exploring",
  "building",
  "launched",
  "paused",
  "closed",
] as const;

export const STATUS_COLOURS: Record<string, string> = {
  launched: "bg-ok/20 text-ok",
  building: "bg-info/20 text-info",
  exploring: "bg-warn/20 text-warn",
  idea: "bg-ink-3/20 text-ink-3",
  paused: "bg-ink-3/20 text-ink-3",
  closed: "bg-danger/20 text-danger",
};

export const PLATFORM_OPTIONS = [
  "meta",
  "tiktok",
  "google",
  "pinterest",
  "twitter",
  "youtube",
  "other",
] as const;

export const PLATFORM_COLOURS: Record<string, string> = {
  meta: "bg-info/20 text-info",
  tiktok: "bg-[#f56db5]/20 text-[#f56db5]",
  google: "bg-warn/20 text-warn",
  pinterest: "bg-danger/20 text-danger",
  twitter: "bg-info/20 text-info",
  youtube: "bg-danger/20 text-danger",
  other: "bg-ink-3/20 text-ink-3",
};

export const STEP_STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export const STEP_STATUS_ICONS: Record<string, string> = {
  todo: "○",
  in_progress: "◐",
  done: "●",
};
