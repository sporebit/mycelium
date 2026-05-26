import type { SessionKind, Slot } from "./types";

export type KindVisual = {
  /** Emoji glyph used in compact lists. Always rendered with `aria-hidden`. */
  icon: string;
  /** Human label for chips and filters. */
  label: string;
  /** A CSS colour or var() string for tinting borders/text. */
  color: string;
  /** Tailwind class fragment for an accent background tint (`bg-…/15`). */
  bgClass: string;
  /** Tailwind class fragment for text colour. */
  textClass: string;
  /** Tailwind class fragment for border colour. */
  borderClass: string;
};

export const KIND_VISUALS: Record<SessionKind, KindVisual> = {
  cardio: {
    icon: "🏃",
    label: "Cardio",
    color: "var(--info)",
    bgClass: "bg-info/15",
    textClass: "text-info",
    borderClass: "border-info/40",
  },
  conditioning: {
    icon: "🔥",
    label: "Conditioning",
    color: "var(--warn)",
    bgClass: "bg-warn/15",
    textClass: "text-warn",
    borderClass: "border-warn/40",
  },
  resistance: {
    icon: "💪",
    label: "Resistance",
    color: "var(--glow-0)",
    bgClass: "bg-accent/15",
    textClass: "text-accent",
    borderClass: "border-accent/40",
  },
  mobility: {
    icon: "🧘",
    label: "Mobility",
    color: "var(--text-1)",
    bgClass: "bg-ink-2",
    textClass: "text-text-1",
    borderClass: "border-ink-3",
  },
  other: {
    icon: "➕",
    label: "Other",
    color: "var(--text-2)",
    bgClass: "bg-ink-2",
    textClass: "text-text-2",
    borderClass: "border-ink-3",
  },
};

/** Big banner glyph for each slot. */
export const SLOT_ICON: Record<Slot, string> = {
  morning: "🌅",
  afternoon: "🌙",
  evening: "🌆",
  extra: "➕",
};

export const SLOT_LABEL: Record<Slot, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
  extra: "EXTRA",
};

/** Slot order for any rendering that walks the day top-to-bottom. */
export const SLOT_ORDER: Slot[] = ["morning", "afternoon", "evening", "extra"];
