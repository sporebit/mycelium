"use client";

import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  SIMPLE_BUCKET_LABEL,
  simpleBucketOf,
  type TicketCategory,
} from "@/lib/tickets/categories";

/**
 * The status chip every Tickets surface uses. Binds to the *category* (spec
 * Flag 2); `name` is the workflow's display name when it differs. With
 * `simple` on, the eight categories collapse to Todo / Doing / Waiting /
 * Done (spec §6).
 */
export function CategoryChip({
  category,
  name,
  simple = false,
  className = "",
}: {
  category: TicketCategory | null | undefined;
  name?: string | null;
  simple?: boolean;
  className?: string;
}) {
  if (!category) {
    return (
      <span
        className={`shrink-0 rounded-sm border border-ink-2 bg-ink-2/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] text-ink-3 ${className}`}
      >
        —
      </span>
    );
  }
  const tone = CATEGORY_TONE[category];
  const label = simple
    ? SIMPLE_BUCKET_LABEL[simpleBucketOf(category)]
    : name && name !== CATEGORY_LABEL[category]
      ? name
      : CATEGORY_LABEL[category];
  return (
    <span
      title={simple ? CATEGORY_LABEL[category] : undefined}
      className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] ${tone.fg} ${tone.bg} ${tone.border} ${className}`}
    >
      {label}
    </span>
  );
}
