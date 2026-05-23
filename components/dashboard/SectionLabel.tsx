import type { ReactNode } from "react";

export function SectionLabel({
  number,
  title,
  status,
  statusTone = "ok",
}: {
  number?: string;
  title: string;
  status?: ReactNode;
  statusTone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneClass =
    statusTone === "warn"
      ? "text-warn"
      : statusTone === "danger"
        ? "text-danger"
        : statusTone === "muted"
          ? "text-ink-3"
          : "text-ok";

  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
      {number && <span>{number} //</span>}
      <span className="text-ink-4">{title}</span>
      {status && (
        <span className={`flex items-center gap-1 ${toneClass}`}>
          <span aria-hidden>●</span>
          <span>{status}</span>
        </span>
      )}
    </div>
  );
}
