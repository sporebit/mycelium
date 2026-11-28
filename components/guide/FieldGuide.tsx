"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { playChime } from "@/components/daily/chime";
import { durationFor } from "@/lib/guides/motion";
import {
  dayWords,
  flightPlan,
  guideToggles,
  longDate,
  nextStep,
  overall,
  phaseProgress,
  resumePoint,
} from "@/lib/guides/progress";
import { isSecretLike, SECRET_REFUSAL } from "@/lib/guides/secret";
import {
  substitute,
  unresolved,
  type StatePatch,
  type Step,
  type StepsDefinition,
  type StepsState,
} from "@/lib/tickets/steps";
import { AnswerBox } from "./AnswerBox";
import { Finish } from "./Finish";
import { FlightPlan } from "./FlightPlan";
import { GuideThemeToggle } from "./GuideThemeToggle";
import { Html, Label } from "./Html";
import { Sitting } from "./Sitting";
import { Thread } from "./Thread";
import { TopBox } from "./TopBox";
import { fill, type GuideMode } from "./text";
import { useMotionLevel } from "./useMotion";

/** Toggles the guide keeps for itself; every other definition toggle is drawn as a choice row. */
const OWN_TOGGLES = new Set(["mode", "sound"]);

function focusStep(id: string, smooth: boolean) {
  const el = document.getElementById(`step-${id}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  el.querySelector<HTMLButtonElement>("[data-testid^='tick-']")?.focus({
    preventScroll: true,
  });
}

/**
 * The Field guide (docs/run/2026-11-28/field-guide-design.md §3): one
 * renderer for every run-book kind, on the ticket page (`frame="ticket"`)
 * and on the standalone page (`frame="page"`, its own header, keyboard:
 * n next, space tick, p park, f flight plan). The same definition and state
 * as the old StepsPage; nothing is migrated (D2, D3).
 */
export function FieldGuide({
  definition: def,
  state,
  kind,
  onPatch,
  busy = false,
  frame,
  chime = false,
  ticketKey,
  title,
  projectName,
}: {
  definition: StepsDefinition;
  state: StepsState;
  kind: string;
  onPatch: (patch: StatePatch) => void | Promise<void>;
  busy?: boolean;
  frame: "ticket" | "page";
  /** Inside the app: the daily loop's chime setting (D8). The standalone page uses its own Sound toggle. */
  chime?: boolean;
  ticketKey?: string;
  title?: string;
  projectName?: string | null;
}) {
  const level = useMotionLevel();
  const toggles = guideToggles(def, state);
  const mode: GuideMode = toggles.mode === "someone" ? "someone" : "me";
  const phases = phaseProgress(def, state);
  const all = overall(def, state, phases);
  const plan = flightPlan(def, state, phases);
  const now = new Date();
  const resume = resumePoint(def, state, now, phases);
  const next = nextStep(def, state, phases);
  const finished = all.total > 0 && all.done === all.total;
  const sound = frame === "page" ? toggles.sound === "on" : chime;

  const [flight, setFlight] = useState(false);
  const [myOnlyChoice, setMyOnly] = useState<boolean | null>(null);
  const myOnly = myOnlyChoice ?? mode === "someone";
  const [linger, setLinger] = useState<string | null>(null);
  const [parking, setParking] = useState(false);
  const [parkNote, setParkNote] = useState("");
  const [parkRefused, setParkRefused] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    },
    [],
  );

  const tick = (step: Step, done: boolean) => {
    if (!done) {
      void onPatch({ steps: { [step.id]: null } });
      return;
    }
    const phase = phases.find((p) => p.steps.some((s) => s.id === step.id));
    const finishesPhase =
      !!phase &&
      phase.steps.every((s) => s.id === step.id || state.steps[s.id]?.done);
    // The sound lands at once, before the save (research rule 24: feedback within 300 ms).
    if (sound) playChime(finishesPhase);
    void onPatch({ steps: { [step.id]: true } });
    if (finishesPhase && phase) {
      const wait = durationFor("nextPhase", level);
      if (wait > 0) {
        setLinger(phase.id);
        if (lingerTimer.current) clearTimeout(lingerTimer.current);
        lingerTimer.current = setTimeout(() => setLinger(null), wait);
      }
    }
  };

  const goToPhase = (id: string) => {
    setFlight(false);
    requestAnimationFrame(() =>
      document
        .getElementById(`phase-${id}`)
        ?.scrollIntoView({
          block: "start",
          behavior: level === "full" ? "smooth" : "auto",
        }),
    );
  };

  // Opens at the next unticked step with the "where I was" line (12.19), once, on the standalone page.
  const resumedOnce = useRef(false);
  const resumeId = resume?.next.id ?? null;
  useEffect(() => {
    if (frame !== "page" || resumedOnce.current || !resumeId) return;
    resumedOnce.current = true;
    requestAnimationFrame(() => focusStep(resumeId, false));
  }, [frame, resumeId]);

  // Keyboard on the standalone page (§3.1): n next unticked, space tick it, p park, f flight plan.
  const nextId = next?.step.id ?? null;
  useEffect(() => {
    if (frame !== "page") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (e.key === "n") {
        e.preventDefault();
        setFlight(false);
        if (nextId)
          requestAnimationFrame(() => focusStep(nextId, level === "full"));
      } else if (e.key === " ") {
        if (t?.closest("button, a, summary")) return; // a focused control keeps its own space
        if (!nextId || flight) return;
        e.preventDefault();
        document
          .getElementById(`step-${nextId}`)
          ?.querySelector<HTMLButtonElement>("[data-testid^='tick-']")
          ?.click();
      } else if (e.key === "p") {
        if (finished) return;
        e.preventDefault();
        setParking(true);
      } else if (e.key === "f") {
        e.preventDefault();
        setFlight((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, nextId, flight, finished, level]);

  const park = () => {
    const note = parkNote.trim();
    if (isSecretLike(note)) {
      setParkRefused(true);
      setParkNote("");
      return;
    }
    if (!next) return;
    void onPatch({ park: { step_id: next.step.id, note } });
    setParking(false);
    setParkNote("");
  };

  const choiceToggles = Object.entries(def.toggles ?? {}).filter(
    ([k]) => !OWN_TOGGLES.has(k),
  );
  const openPhase = phases.find((p) => p.state === "open");
  const parkDay = state.park ? dayWords(state.park.at, now) : null;

  const modeControls = (
    <div className="fg-ui fg-noprint flex flex-wrap items-center gap-2 text-[13px]">
      <button
        type="button"
        aria-pressed={mode === "someone"}
        onClick={() =>
          void onPatch({
            toggles: { mode: mode === "someone" ? "me" : "someone" },
          })
        }
        className={`fg-btn min-h-[36px] rounded-lg px-3 ${mode === "someone" ? "fg-btn-on" : ""}`}
        data-testid="guide-mode"
      >
        {mode === "someone" ? "Back to my view" : "For someone else"}
      </button>
      <button
        type="button"
        aria-pressed={myOnly}
        onClick={() => setMyOnly(!myOnly)}
        className={`fg-btn min-h-[36px] rounded-lg px-3 ${myOnly ? "fg-btn-on" : ""}`}
      >
        Only my steps
      </button>
      {frame === "ticket" && (
        <button
          type="button"
          aria-pressed={flight}
          onClick={() => setFlight((v) => !v)}
          className={`fg-btn min-h-[36px] rounded-lg px-3 ${flight ? "fg-btn-on" : ""}`}
          data-testid="guide-flight"
        >
          Flight plan
        </button>
      )}
      {frame === "ticket" && ticketKey && (
        <>
          <Link
            href={`/guides/${encodeURIComponent(ticketKey)}`}
            className="fg-btn inline-flex min-h-[36px] items-center rounded-lg px-3"
          >
            Open full page
          </Link>
          <a
            href={`/api/tickets/${encodeURIComponent(ticketKey)}/guide.html`}
            download
            className="fg-btn inline-flex min-h-[36px] items-center rounded-lg px-3"
          >
            Download
          </a>
        </>
      )}
    </div>
  );

  return (
    <div
      className={`fg-root ${frame === "page" ? "min-h-screen" : "rounded-2xl border fg-border"}`}
      data-mode={mode}
      data-frame={frame}
      data-testid="field-guide"
      data-kind={kind}
    >
      <div
        className={`mx-auto flex w-full flex-col gap-5 ${frame === "page" ? "max-w-[880px] px-4 pb-24 pt-4 sm:px-6 sm:pt-6" : "p-3 sm:p-5"}`}
      >
        {frame === "page" && (
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="fg-ui fg-soft text-[13px]">
                  <span className="fg-mono">{ticketKey}</span>
                  {projectName ? ` · ${projectName}` : ""} · Field guide
                </div>
                <h1 className="fg-ink mt-1 text-[24px] leading-tight sm:text-[30px]">
                  {def.title || title}
                </h1>
              </div>
              <nav
                className="fg-ui fg-noprint flex flex-wrap items-center gap-2 text-[13px]"
                aria-label="Guide"
              >
                {ticketKey && (
                  <Link
                    href={`/work/browse/${encodeURIComponent(ticketKey)}`}
                    className="fg-btn inline-flex min-h-[40px] items-center rounded-lg px-3"
                  >
                    Open ticket
                  </Link>
                )}
                <button
                  type="button"
                  aria-pressed={flight}
                  onClick={() => setFlight((v) => !v)}
                  className={`fg-btn min-h-[40px] rounded-lg px-3 ${flight ? "fg-btn-on" : ""}`}
                  data-testid="guide-flight"
                >
                  Flight plan
                </button>
                <GuideThemeToggle />
                <button
                  type="button"
                  aria-pressed={sound}
                  onClick={() =>
                    void onPatch({ toggles: { sound: sound ? "off" : "on" } })
                  }
                  className={`fg-btn min-h-[40px] rounded-lg px-3 ${sound ? "fg-btn-on" : ""}`}
                >
                  {sound ? "Turn sound off" : "Turn sound on"}
                </button>
                {ticketKey && (
                  <a
                    href={`/api/tickets/${encodeURIComponent(ticketKey)}/guide.html`}
                    download
                    className="fg-btn inline-flex min-h-[40px] items-center rounded-lg px-3"
                    data-testid="guide-download"
                  >
                    Download
                  </a>
                )}
              </nav>
            </div>
          </header>
        )}

        {modeControls}

        {!flight && <TopBox definition={def} state={state} mode={mode} frame={frame} />}

        {!flight && choiceToggles.length > 0 && (
          <div className="fg-ui fg-noprint flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {choiceToggles.map(([key, t]) => (
              <div key={key} className="flex flex-wrap items-center gap-1.5">
                <span className="fg-soft">{t.label}</span>
                {Object.entries(t.options).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={toggles[key] === val}
                    onClick={() => void onPatch({ toggles: { [key]: val } })}
                    className={`fg-btn min-h-[36px] rounded-full px-3 ${toggles[key] === val ? "fg-btn-on" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {!flight && def.values && def.values.length > 0 && (
          <section id="values" className="fg-card rounded-xl p-3">
            <Label>Values used throughout</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {def.values.map((v) => (
                <AnswerBox
                  key={v.key}
                  label={v.label}
                  placeholder={v.placeholder}
                  value={state.answers[v.key] ?? ""}
                  onSave={(val) =>
                    void onPatch({ answers: { [v.key]: val || null } })
                  }
                />
              ))}
            </div>
          </section>
        )}

        <div
          className="fg-thread-band sticky top-0 z-20 -mx-3 px-3 py-2 sm:-mx-5 sm:px-5"
          data-testid="guide-thread"
        >
          <Thread
            phases={phases.map((p) => ({
              id: p.id,
              title: p.title,
              pct: p.pct,
              state: p.state,
              done: p.done,
              total: p.total,
              minutes: Math.round(p.minutes_left_est * all.ratio),
            }))}
            pct={all.pct}
            minutesLeft={all.minutes_left_est}
            level={level}
            onBranch={goToPhase}
          />
        </div>

        {resume && !state.park && !flight && (
          <p className="fg-ui fg-soft text-[14px]" data-testid="guide-resume">
            {resume.line}
          </p>
        )}

        {state.park && (
          <div
            className="fg-park flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-[15px]"
            data-testid="guide-park-banner"
            role="status"
          >
            <span>
              Parked at <span className="fg-mono">{state.park.step_id}</span>{" "}
              {parkDay}
              {state.park.note ? (
                <>
                  : <em>{state.park.note}</em>
                </>
              ) : null}
              .{" "}
              {parkDay === "today"
                ? "Back on tomorrow's list."
                : "Back on today's list."}
            </span>
            <button
              type="button"
              onClick={() => void onPatch({ park: null })}
              className="fg-btn fg-noprint ml-auto min-h-[36px] rounded-lg px-3 text-[13px]"
            >
              Unpark
            </button>
          </div>
        )}

        {parking && next && (
          <form
            className="fg-card flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              park();
            }}
            data-testid="guide-park-form"
          >
            <label className="flex flex-1 flex-col gap-1">
              <span className="fg-ui fg-soft text-[13px]">
                Where did you stop? One line. It goes back on tomorrow&apos;s
                list at <span className="fg-mono">{next.step.id}</span>.
              </span>
              <input
                autoFocus
                value={parkNote}
                onChange={(e) => {
                  setParkNote(e.target.value);
                  setParkRefused(false);
                }}
                className="fg-input min-h-[40px] rounded-md px-3 text-[15px]"
                placeholder="Waiting for the DNS to update"
              />
            </label>
            <div className="flex gap-2 sm:self-end">
              <button
                type="submit"
                className="fg-btn fg-btn-on min-h-[40px] rounded-md px-3"
              >
                Park
              </button>
              <button
                type="button"
                onClick={() => setParking(false)}
                className="fg-btn-quiet min-h-[40px] rounded-md px-3"
              >
                Cancel
              </button>
            </div>
            {parkRefused && (
              <p
                role="alert"
                className="fg-ui fg-amber-t text-[13px] sm:basis-full"
              >
                {SECRET_REFUSAL}
              </p>
            )}
          </form>
        )}

        {flight ? (
          <FlightPlan plan={plan} onOpen={goToPhase} />
        ) : (
          <div className="flex flex-col gap-3">
            {phases.map((p) => (
              <Sitting
                key={p.id}
                progress={p}
                definition={def}
                state={state}
                mode={mode}
                toggles={toggles}
                busy={busy}
                myStepsOnly={myOnly}
                lingering={linger === p.id}
                held={!!linger && linger !== p.id && p.id === openPhase?.id}
                onTick={tick}
                onAnswer={(k, v) =>
                  void onPatch({ answers: { [k]: v || null } })
                }
                onFailure={(id, note) =>
                  void onPatch({
                    failures: { [id]: note === null ? null : { note } },
                  })
                }
                onPark={() => setParking(true)}
              />
            ))}
          </div>
        )}

        {finished && !flight && (
          <Finish definition={def} state={state} mode={mode} />
        )}

        <footer className="flex flex-col gap-2">
          {def.rollback_html && (
            <details className="fg-fold fg-rollback rounded-xl border px-3 py-2">
              <summary className="fg-ui fg-umber-t cursor-pointer text-[14px]">
                Rollback
              </summary>
              <Html
                html={fill(def.rollback_html, def, state, mode)}
                className="mt-2 text-[15px]"
              />
            </details>
          )}
          {def.troubleshooting && def.troubleshooting.length > 0 && (
            <details className="fg-fold rounded-xl border fg-border px-3 py-2">
              <summary className="fg-ui fg-soft cursor-pointer text-[14px]">
                Troubleshooting for the whole guide
              </summary>
              <ul className="mt-2 flex flex-col gap-2 text-[15px]">
                {def.troubleshooting.map((t, i) => (
                  <li key={i}>
                    <span className="fg-ink">{t.symptom}</span>
                    {t.cause && <span className="fg-soft">: {t.cause}</span>}
                    {t.fix && (
                      <div className="fg-soft">
                        <Html html={t.fix} inline />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {def.links && def.links.length > 0 && (
            <div className="px-1">
              <Label>Links</Label>
              <ul className="mt-1 flex flex-col gap-1 text-[15px]">
                {def.links.map((l, i) => {
                  const url = substitute(l.url, def, state);
                  return (
                    <li key={i}>
                      {unresolved(url) ? (
                        <a href="#values" className="fg-amber-t underline">
                          {l.label} (fill in the values first)
                        </a>
                      ) : (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="fg-moss-t underline"
                        >
                          {l.label}
                        </a>
                      )}
                      {l.note && <span className="fg-soft">: {l.note}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {def.intro?.sources && def.intro.sources.length > 0 && (
            <div className="px-1">
              <Label>Sources</Label>
              <ul className="mt-1 flex flex-col gap-1 text-[15px]">
                {def.intro.sources.map((s, i) => (
                  <li key={i}>
                    {/^https?:\/\//.test(s.url) ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="fg-moss-t underline"
                      >
                        {s.label}
                      </a>
                    ) : (
                      <span>{s.label}</span>
                    )}{" "}
                    <span className="fg-ui fg-soft text-[13px]">
                      checked{" "}
                      <span className="fg-mono">{longDate(s.checked_on)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {frame === "page" && (
            <p className="fg-ui fg-faint fg-noprint px-1 text-[12px]">
              Keys: n next step, space tick it, p park, f flight plan.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
