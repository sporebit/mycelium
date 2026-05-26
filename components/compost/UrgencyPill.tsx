import type { Task } from "@/lib/types/task";

export type PillTone = "hot" | "warm" | "cool";

export function pillToneFor(task: Task): PillTone {
  if (task.key) return "hot";
  if (task.urgency === "today" || task.urgency === "this_week") return "warm";
  return "cool";
}

const TONE_LABEL: Record<PillTone, string> = {
  hot: "HOT",
  warm: "WARM",
  cool: "COOL",
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
