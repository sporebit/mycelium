"use client";

import { useState } from "react";
import { londonTime, type PhaseProgress } from "@/lib/guides/progress";
import type { Step, StepsDefinition, StepsState } from "@/lib/tickets/steps";
import { Html } from "./Html";
import { StepCard } from "./StepCard";
import { fill, type GuideMode } from "./text";

function finishedWords(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(d);
  return `${day} ${londonTime(iso)}`;
}

/**
 * A phase as a sitting (design §3.2.5). Finished: one line with a tick,
 * the title and its time. Later: title, time and what it needs, opened
 * only with "open anyway". Open: the header, lede, the hard part, the
 * steps, Park, then Verify and Why folded shut.
 */
export function Sitting({
  progress: p,
  definition: def,
  state,
  mode,
  toggles,
  busy,
  myStepsOnly,
  lingering,
  held = false,
  onTick,
  onAnswer,
  onFailure,
  onPark,
}: {
  progress: PhaseProgress;
  definition: StepsDefinition;
  state: StepsState;
  mode: GuideMode;
  toggles: Record<string, string>;
  busy: boolean;
  myStepsOnly: boolean;
  /** Just finished: stays open for a moment so the fruit is seen before the next sitting opens. */
  lingering: boolean;
  /** The next sitting waits (600 ms) while the one just finished shows its fruit. */
  held?: boolean;
  onTick: (step: Step, done: boolean) => void;
  onAnswer: (key: string, value: string) => void;
  onFailure: (stepId: string, note: string | null) => void;
  onPark: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const phase = p.phase;
  const isOpen = (p.state === "open" && !held) || lingering || expanded;
  const minutesText =
    p.state === "done" && p.minutes_actual !== null ? (
      <>
        <span className="fg-mono">{p.minutes_actual}</span> min
      </>
    ) : (
      <>
        about <span className="fg-mono">{Math.round(p.minutes_est)}</span> min
      </>
    );

  if (!isOpen) {
    return (
      <section id={`phase-${p.id}`} data-phase={p.id} data-state={p.state} className="fg-sitting-line scroll-mt-28 rounded-xl border fg-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {p.state === "done" ? (
            <span className="fg-moss-t" aria-label="finished">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : (
            <span className="fg-faint fg-mono text-[12px]" aria-hidden>
              {p.n}
            </span>
          )}
          <h3 className={`text-[16px] ${p.state === "done" ? "fg-soft" : "fg-ink"}`}>
            <span className="fg-ui fg-soft text-[13px]">Sitting <span className="fg-mono">{p.n}</span> · </span>
            {p.title}
          </h3>
          <span className="fg-ui fg-soft text-[13px]">
            {minutesText}
            {p.state === "done" && p.last_at ? `, finished ${finishedWords(p.last_at)}` : ""}
            {p.state === "later" && phase.needs?.length ? ` · needs: ${phase.needs.join(", ")}` : ""}
          </span>
          <button type="button" onClick={() => setExpanded(true)} className="fg-btn-quiet fg-ui fg-noprint ml-auto min-h-[32px] rounded-md px-2 text-[13px]">
            {p.state === "done" ? "Show steps" : "Open anyway"}
          </button>
        </div>
      </section>
    );
  }

  const steps = p.steps.filter((s) => !(myStepsOnly && s.actor === "claude-code"));
  const hiddenClaude = p.steps.length - steps.length;

  return (
    <section id={`phase-${p.id}`} data-phase={p.id} data-state={p.state} data-open="true" className="fg-sitting-open scroll-mt-28 rounded-2xl border fg-border p-3 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="fg-ink text-[19px] leading-snug sm:text-[21px]">
          <span className="fg-ui fg-moss-t mr-1 text-[13px] font-semibold">Sitting <span className="fg-mono">{p.n}</span></span> {p.title}
        </h3>
        <span className="fg-ui fg-soft text-[13px]">
          <span className="fg-mono">
            {p.done}/{p.total}
          </span>{" "}
          · {minutesText}
          {expanded && p.state !== "open" && (
            <button type="button" onClick={() => setExpanded(false)} className="fg-btn-quiet fg-noprint ml-2 rounded-md px-2">
              Fold
            </button>
          )}
        </span>
      </header>
      {phase.lede_html && <Html html={fill(phase.lede_html, def, state, mode)} className="fg-soft mt-2 text-[16px]" />}
      {phase.hard_part && (
        <p className="fg-ui fg-amber-t mt-2 text-[14px]">
          The tricky bit: <span className="fg-ink">{phase.hard_part}</span>
        </p>
      )}
      {phase.needs && phase.needs.length > 0 && <p className="fg-ui fg-soft mt-1 text-[13px]">Needs: {phase.needs.join(", ")}</p>}

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((s) => (
          <StepCard
            key={s.id}
            step={s}
            definition={def}
            state={state}
            mode={mode}
            toggles={toggles}
            busy={busy}
            onTick={(d) => onTick(s, d)}
            onAnswer={onAnswer}
            onFailure={(note) => onFailure(s.id, note)}
          />
        ))}
      </ol>
      {hiddenClaude > 0 && (
        <p className="fg-ui fg-soft mt-2 text-[13px]">
          {hiddenClaude === 1 ? "One step is Claude's" : `${hiddenClaude} steps are Claude's`}, hidden by Only my steps.
        </p>
      )}

      {p.state === "open" && (
        <div className="fg-noprint mt-3">
          <button type="button" onClick={onPark} className="fg-btn-quiet fg-ui min-h-[36px] rounded-md px-2 text-[14px]">
            Park here
          </button>
        </div>
      )}

      {phase.verify_html && phase.verify_html.length > 0 && (
        <details className="fg-fold mt-3">
          <summary className="fg-ui fg-soft cursor-pointer text-[14px]">Verify</summary>
          <ul className="ml-5 mt-2 list-disc text-[15px]">
            {phase.verify_html.map((v, i) => (
              <li key={i}>
                <Html html={fill(v, def, state, mode)} inline />
              </li>
            ))}
          </ul>
        </details>
      )}
      {phase.why_html && (
        <details className="fg-fold mt-1">
          <summary className="fg-ui fg-soft cursor-pointer text-[14px]">Why this works</summary>
          <Html html={fill(phase.why_html, def, state, mode)} className="mt-2 text-[15px]" />
        </details>
      )}
    </section>
  );
}
