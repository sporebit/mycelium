"use client";

/** The research status line (spec §2.7): "3 researching · 1 stuck · last ok 4 min ago · £0.12 this month". */
import { ago, pounds, type ResearchLine as Line } from "./api";

export function ResearchLine({ research }: { research: Line | null }) {
  if (!research) return <p className="text-xs text-text-lo" data-testid="pm-research-line">Research status unavailable.</p>;
  const lastOk = Object.values(research.last_ok_by_source).filter((v): v is string => !!v).sort().at(-1) ?? null;
  const parts = [
    `${research.queue_depth} researching`,
    research.stuck > 0 ? `${research.stuck} stuck` : null,
    `last ok ${ago(lastOk)}`,
    research.month_cost_pence > 0 ? `${pounds(research.month_cost_pence)} this month` : null,
    !research.paid_allowed && research.paid_reason ? research.paid_reason : null,
  ].filter(Boolean);
  return (
    <p className={`text-xs ${research.stuck > 0 ? "text-warn" : "text-text-lo"}`} data-testid="pm-research-line">
      {parts.join(" · ")}
    </p>
  );
}
