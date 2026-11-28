"use client";

import type { FlightPlan as Plan } from "@/lib/guides/progress";

const STATE_WORDS = { done: "finished", open: "open now", later: "later" } as const;

/**
 * The flight plan (design §3.3, brief 12b): every sitting on one screen
 * with its time (corrected by real ticks, D14), what it needs and the hard
 * part, and a total line. Printable: controls hide under @media print.
 */
export function FlightPlan({ plan, onOpen }: { plan: Plan; onOpen?: (phaseId: string) => void }) {
  return (
    <section aria-label="Flight plan" className="fg-card rounded-2xl p-3 sm:p-5" data-testid="flight-plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="fg-ink text-[20px]">Flight plan</h2>
        <p className="fg-ui fg-soft text-[14px]" data-testid="flight-total">
          {plan.summary}
          {plan.ratio !== 1 && plan.minutes_left > 0 && (
            <>
              {" "}
              · corrected from your real times, <span className="fg-mono">{plan.minutes_left}</span> min left
            </>
          )}
        </p>
      </div>
      <ol className="mt-4 flex flex-col">
        {plan.rows.map((r) => (
          <li key={r.id} className={`grid grid-cols-[2rem_1fr_auto] gap-x-3 gap-y-1 border-t fg-border py-3 ${r.state === "open" ? "fg-row-open" : ""}`}>
            <span className={`fg-mono pt-0.5 text-[15px] ${r.state === "done" ? "fg-moss-t" : "fg-soft"}`}>{r.n}</span>
            <div className="min-w-0">
              {onOpen ? (
                <button type="button" onClick={() => onOpen(r.id)} className={`text-left text-[17px] ${r.state === "done" ? "fg-soft" : "fg-ink"} hover:underline`}>
                  {r.title}
                </button>
              ) : (
                <span className={`text-[17px] ${r.state === "done" ? "fg-soft" : "fg-ink"}`}>{r.title}</span>
              )}
              {r.needs.length > 0 && <p className="fg-ui fg-soft text-[13px]">Needs: {r.needs.join(", ")}</p>}
              {r.hard_part && (
                <p className="fg-ui text-[13px]">
                  <span className="fg-amber-t">The tricky bit:</span> <span className="fg-soft">{r.hard_part}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="fg-ui fg-soft text-[13px]">
                {r.state === "done" ? "" : "about "}
                <span className="fg-mono fg-ink text-[15px]">{r.minutes}</span> min
              </div>
              <div className={`fg-ui text-[12px] ${r.state === "open" ? "fg-moss-t" : "fg-faint"}`}>{STATE_WORDS[r.state]}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
