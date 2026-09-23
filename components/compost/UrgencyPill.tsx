import type { Task } from "@/lib/types/task";
import { isDueWithin, isOverdue, todayLondon } from "@/lib/tickets/when";

/**
 * The classic surfaces' tone pill. Since tickets spec §18 the urgency
 * labels are gone: HOT = overdue, WARM = due within seven days (or a key
 * ticket), COOL = the rest.
 */
export type PillTone = "hot" | "warm" | "cool";

export function pillToneFor(task: Task, today: string = todayLondon()): PillTone {
  if (isOverdue(task, today)) return "hot";
  if (task.key || isDueWithin(task, today, 7)) return "warm";
  return "cool";
}

const TONE_LABEL: Record<PillTone, string> = {
  hot: "OVERDUE",
  warm: "DUE SOON",
  cool: "LATER",
};

const TONE_CLASS: Record<PillTone, string> = {
  hot: "bg-danger/15 text-danger border-danger/40",
  warm: "bg-warn/15 text-warn border-warn/40",
  cool: "bg-ink-2 text-ink-3 border-ink-2",
};

export function UrgencyPill({
  tone,
  label,
}: {
  tone: PillTone;
  label?: string;
}) {
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${TONE_CLASS[tone]}`}
    >
      {label ?? TONE_LABEL[tone]}
    </span>
  );
}
