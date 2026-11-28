"use client";

import type { StepsDefinition, StepsState } from "@/lib/tickets/steps";
import { freshness, longDate, todayLondonDate } from "@/lib/guides/progress";
import { Html, Label } from "./Html";
import { fill, type GuideMode } from "./text";

/**
 * The top box (design §3.2.1): the one-line answer first, then three small
 * cards (what this unlocks, what to have to hand, the tricky bit), the
 * freshness line, the comparison table only when there was a choice, and
 * prerequisites, time and cost folded under one "Before you start" line.
 * An old definition with no `answer` shows its verdict in the same place.
 */
export function TopBox({ definition: def, state, mode, frame }: { definition: StepsDefinition; state: StepsState; mode: GuideMode; frame: "ticket" | "page" }) {
  const intro = def.intro ?? {};
  const fresh = freshness(def, todayLondonDate());
  const before = [
    ...(intro.prerequisites ?? []),
    ...(intro.time ?? []).map((t) => `Time: ${t}`),
    ...(intro.cost ?? []).map((c) => `Cost: ${c}`),
    ...(intro.changes_html ?? []),
  ];
  const cards: Array<{ title: string; body: React.ReactNode }> = [];
  if (intro.unlocks?.length) {
    cards.push({
      title: "What this unlocks",
      body: (
        <ul className="ml-4 list-disc">
          {intro.unlocks.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      ),
    });
  }
  if (intro.to_hand?.length) {
    cards.push({
      title: "You will need to hand",
      body: (
        <ul className="ml-4 list-disc">
          {intro.to_hand.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      ),
    });
  }
  if (intro.hard_part) {
    cards.push({
      title: "The tricky bit",
      body: (
        <p>
          {mode === "me" && <span className="fg-mono">Step {intro.hard_part.step_id}: </span>}
          {intro.hard_part.why}
        </p>
      ),
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-label="About this guide">
      {mode === "someone" && def.basics_html && (
        <div className="fg-card rounded-xl p-4">
          <Label>The basics</Label>
          <Html html={fill(def.basics_html, def, state, mode)} className="mt-1" />
        </div>
      )}
      {intro.answer ? (
        <p className={`fg-ink leading-snug ${frame === "page" ? "text-[20px] sm:text-[24px]" : "text-[19px] sm:text-[22px]"}`} data-testid="guide-answer">
          {intro.answer}
        </p>
      ) : intro.verdict_html ? (
        <Html html={fill(intro.verdict_html, def, state, mode)} className="fg-ink text-[17px] leading-relaxed" />
      ) : null}

      {cards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="fg-card rounded-xl p-3 text-[15px] leading-snug">
              <Label className="mb-1">{c.title}</Label>
              {c.body}
            </div>
          ))}
        </div>
      )}

      {intro.last_verified && (
        <p className={`fg-ui text-[13px] ${fresh === "amber" ? "fg-amber-t" : "fg-soft"}`} data-testid="guide-freshness">
          Last verified <span className="fg-mono">{longDate(intro.last_verified.slice(0, 10))}</span>
          {fresh === "amber" && ", check before trusting"}
        </p>
      )}

      {intro.comparison && intro.comparison.columns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr>
                {intro.comparison.columns.map((c, i) => (
                  <th key={i} className="fg-ui fg-soft border-b fg-border px-2 py-1.5 text-left text-[12px] font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {intro.comparison.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className="border-b fg-border px-2 py-1.5 align-top">
                      <Html html={cell} inline />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {before.length > 0 && (
        <details className="fg-fold">
          <summary className="fg-ui fg-soft cursor-pointer text-[14px]">Before you start</summary>
          <ul className="ml-5 mt-2 list-disc text-[15px]">
            {before.map((b, i) => (
              <li key={i}>
                <Html html={fill(b, def, state, mode)} inline />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
