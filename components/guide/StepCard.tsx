"use client";

import { useEffect, useRef, useState } from "react";
import { DURATIONS } from "@/lib/guides/motion";
import { londonTime, stepHistory } from "@/lib/guides/progress";
import { isSecretLike, SECRET_REFUSAL } from "@/lib/guides/secret";
import { sanitizeHtml } from "@/lib/tickets/sanitize";
import { routeLabel, type Step, type StepsDefinition, type StepsState } from "@/lib/tickets/steps";
import { AnswerBox } from "./AnswerBox";
import { CopyBlock } from "./CopyBlock";
import { Html } from "./Html";
import { blockText, fill, htmlText, isShellBlock, whereHref, type GuideMode } from "./text";

const ACTOR: Record<string, string> = { you: "You", "claude-code": "Claude Code", gate: "Check" };

/**
 * One step (design §3.2.6): the tick (a 44 px target), id, title, actor,
 * platform and where chips, minutes; then the body, blocks with copy
 * buttons, the value, answer boxes, notes, "What you should see", the
 * "This did not work" box and the folded troubleshooting. An irreversible
 * step takes two taps to tick. A ticked step collapses to its row.
 */
export function StepCard({
  step,
  definition: def,
  state,
  mode,
  toggles,
  busy,
  onTick,
  onAnswer,
  onFailure,
}: {
  step: Step;
  definition: StepsDefinition;
  state: StepsState;
  mode: GuideMode;
  toggles: Record<string, string>;
  busy: boolean;
  onTick: (done: boolean) => void;
  onAnswer: (key: string, value: string) => void;
  onFailure: (note: string | null) => void;
}) {
  const done = !!state.steps[step.id]?.done;
  const at = state.steps[step.id]?.at;
  const failure = state.failures?.[step.id];
  const [open, setOpen] = useState(!done);
  const [wasDone, setWasDone] = useState(done);
  const [armed, setArmed] = useState(false);
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState("");
  const [refused, setRefused] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);
  // A step ticked elsewhere (another tab, the keyboard) folds itself; unticked, it opens again.
  if (wasDone !== done) {
    setWasDone(done);
    setOpen(!done);
  }

  const someone = mode === "someone";
  const claude = step.actor === "claude-code";
  const own = (step.actor ?? "you") === "you";
  const title = someone && step.plain_title ? step.plain_title : step.title;
  const href = whereHref(step.where?.url, def, state);
  const tested = def.tested?.[step.id];
  const history = stepHistory(state, step.id);

  // Ticks are never blocked while a save is in flight: the server merges per key, so two quick ticks both land.
  const press = () => {
    if (done) return onTick(false);
    if (step.irreversible && !armed) {
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), DURATIONS.arm);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
    onTick(true);
  };

  const shellHidden = someone && (step.blocks ?? []).some(isShellBlock);
  const blocks = (step.blocks ?? []).filter((b) => !(someone && isShellBlock(b)));
  const body = someone && step.plain_body_html ? step.plain_body_html : step.body_html;

  return (
    <li
      id={`step-${step.id}`}
      data-step={step.id}
      data-done={done || undefined}
      className={`fg-step relative scroll-mt-28 rounded-xl border ${step.irreversible ? "fg-irreversible" : "fg-border"} ${done ? "fg-step-done" : "fg-card-solid"}`}
    >
      <div className={`flex items-start gap-2 py-2 pr-3 ${step.irreversible ? "pl-4" : "pl-1"}`}>
        <button
          type="button"
          onClick={press}
          data-busy={busy || undefined}
          className={`fg-tick flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${armed ? "fg-tick-armed" : ""}`}
          aria-label={done ? `Untick step ${step.id}` : armed ? `Tap again to confirm step ${step.id}` : `Tick step ${step.id}`}
          aria-pressed={done}
          data-testid={`tick-${step.id}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${done ? "fg-tick-box-done" : armed ? "fg-tick-box-armed" : "fg-tick-box"}`}>
            {done && (
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {!someone && <span className="fg-mono fg-soft text-[12px]">{step.id}</span>}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`text-left text-[16px] leading-snug ${done ? "fg-soft" : "fg-ink"}`}
              aria-expanded={open}
            >
              {title}
            </button>
          </div>
          <div className="fg-ui mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
            {!someone && step.actor && <span className={`fg-chip ${claude ? "fg-chip-moss" : ""}`}>{ACTOR[step.actor] ?? step.actor}</span>}
            {step.platforms && step.platforms.length > 0 && (
              <span className="fg-chip">{step.platforms.map((p) => def.toggles?.platform?.options?.[p] ?? p).join(", ")}</span>
            )}
            {!someone && step.route && <span className="fg-chip">{routeLabel(def, step.route)}</span>}
            {step.where &&
              (href ? (
                <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="fg-chip fg-chip-link">
                  {step.where.label}
                </a>
              ) : (
                <span className="fg-chip">{step.where.label}</span>
              ))}
            {typeof step.minutes === "number" && step.minutes > 0 && (
              <span className="fg-soft">
                about <span className="fg-mono">{step.minutes}</span> min
              </span>
            )}
            {step.irreversible && <span className="fg-umber-t font-semibold">Cannot be undone</span>}
            {tested === "untested" && <span className="fg-chip fg-faint" title="Claude could not run this step against the real thing or a sandbox">untested</span>}
            {armed && (
              <span role="status" className="fg-umber-t font-semibold">
                Tap again to confirm
              </span>
            )}
            {done && at && <span className="fg-soft fg-mono">{history ?? londonTime(at)}</span>}
            {!done && failure && <span className="fg-amber-t">Noted at <span className="fg-mono">{londonTime(failure.at)}</span></span>}
          </div>
        </div>
      </div>

      {claude && done && step.did_html && (
        <div className="fg-soft px-4 pb-3 text-[15px] sm:pl-[3.25rem]">
          Claude did this: <Html html={fill(step.did_html, def, state, mode)} inline />
        </div>
      )}

      {open && !(claude && done) && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-[16px] leading-relaxed sm:pl-[3.25rem]">
          {body && <Html html={fill(body, def, state, mode)} />}
          {claude && !done && step.did_html && (
            <p className="fg-soft text-[15px]">
              Claude does this: <Html html={fill(step.did_html, def, state, mode)} inline />
            </p>
          )}
          {step.screenshot && (
            <figure className="relative overflow-hidden rounded-lg border fg-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- an authored screenshot of any size; no optimisation wanted */}
              <img src={step.screenshot.src} alt={step.screenshot.alt} className="block w-full" />
              {step.screenshot.mark && (
                <span
                  aria-hidden
                  className="fg-mark absolute rounded-md"
                  style={{ left: `${step.screenshot.mark.x}%`, top: `${step.screenshot.mark.y}%`, width: `${step.screenshot.mark.w}%`, height: `${step.screenshot.mark.h}%` }}
                />
              )}
            </figure>
          )}
          {blocks.map((b, i) => (
            <CopyBlock key={i} label={b.label} kind={b.kind} text={fill(blockText(b, toggles.shell), def, state, mode)} />
          ))}
          {shellHidden && <p className="fg-soft fg-ui text-[14px]">Phil runs this part.</p>}
          {step.value_html && (
            <CopyBlock
              kind="value"
              label="Value"
              text={htmlText(fill(step.value_html, def, state, mode))}
              html={sanitizeHtml(fill(step.value_html, def, state, mode))}
            />
          )}
          {step.fields && step.fields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {step.fields.map((f) => (
                <AnswerBox key={f.key} label={f.label} placeholder={f.placeholder} value={state.answers[f.key] ?? ""} onSave={(v) => onAnswer(f.key, v)} />
              ))}
            </div>
          )}
          {step.notes?.map((n, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-[14px] ${n.kind === "security" || n.kind === "warn" ? "fg-border-amber" : "fg-border fg-soft"}`}>
              <Html html={fill(n.html, def, state, mode)} inline />
            </div>
          ))}
          {step.after_html && (
            <p className="fg-soft text-[14px]">
              After it reports: <Html html={fill(step.after_html, def, state, mode)} inline />
            </p>
          )}

          {own && (
            <div className="fg-expect rounded-r-lg py-2 pl-3 pr-3" data-testid={`expect-${step.id}`}>
              <div className="fg-ui fg-moss-t mb-0.5 text-[12px] font-semibold">What you should see</div>
              {step.expect_html ? <Html html={fill(step.expect_html, def, state, mode)} /> : <p className="fg-soft">No check written for this step</p>}
            </div>
          )}

          {failure && (
            <p className="fg-ui fg-amber-t text-[14px]" data-testid={`failure-${step.id}`}>
              Noted at <span className="fg-mono">{londonTime(failure.at)}</span>
              {failure.note ? `: ${failure.note}` : ""}
              <button type="button" className="fg-btn-quiet fg-noprint ml-2 underline" onClick={() => onFailure(null)}>
                Clear note
              </button>
            </p>
          )}

          {!done && own && (
            <div className="fg-noprint">
              {failing ? (
                <form
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = note.trim();
                    if (isSecretLike(v)) {
                      setRefused(true);
                      setNote("");
                      return;
                    }
                    onFailure(v);
                    setFailing(false);
                    setNote("");
                  }}
                >
                  <input
                    autoFocus
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setRefused(false);
                    }}
                    placeholder="What did you see?"
                    aria-label={`What happened at step ${step.id}`}
                    className="fg-input min-h-[40px] flex-1 rounded-md px-3 text-[15px]"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="fg-btn min-h-[40px] rounded-md px-3">
                      Save note
                    </button>
                    <button type="button" className="fg-btn-quiet min-h-[40px] rounded-md px-3" onClick={() => setFailing(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="fg-btn-quiet fg-ui min-h-[36px] rounded-md px-2 text-[14px]" onClick={() => setFailing(true)}>
                  This did not work
                </button>
              )}
              {refused && (
                <p role="alert" className="fg-ui fg-amber-t mt-1 text-[13px]">
                  {SECRET_REFUSAL}
                </p>
              )}
            </div>
          )}

          {step.troubleshooting && step.troubleshooting.length > 0 && (
            <details className="fg-fold" open={!!failure || undefined} key={failure ? "open" : "shut"}>
              <summary className="fg-ui fg-soft cursor-pointer text-[14px]">If it did not work</summary>
              <ul className="mt-2 flex flex-col gap-2 text-[15px]">
                {step.troubleshooting.map((t, i) => (
                  <li key={i}>
                    <span className="fg-ink">{t.symptom}</span>
                    <div className="fg-soft">
                      <Html html={t.fix} inline />
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
