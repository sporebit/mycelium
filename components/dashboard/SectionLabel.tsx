import type { ReactNode } from "react";

export function SectionLabel({
  title,
  status,
  statusTone = "ok",
}: {
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
          ? "text-text-lo"
          : "text-ok";

  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-lo font-[family-name:var(--font-mono)]">
      <span className="text-text-hi">{title}</span>
      {status && (
        <span className={`flex items-center gap-1 ${toneClass}`}>
          <span aria-hidden>●</span>
          <span>{status}</span>
        </span>
      )}
    </div>
  );
}
