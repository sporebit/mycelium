"use client";

import { useState } from "react";
import { sanitizeHtml } from "@/lib/tickets/sanitize";
import {
  countSteps,
  effectiveToggles,
  routeLabel,
  substitute,
  unresolved,
  visibleSteps,
  type Step,
  type StepsDefinition,
  type StepsState,
  type StatePatch,
} from "@/lib/tickets/steps";

/**
 * The house-style run-book page (checklists spec §5, tickets spec §9.2):
 * intro, toggles, values, phases → steps with an actor, an exact "where"
 * chip, the exact "what" (copyable blocks with shell panes), answer boxes,
 * notes, then verify + why per phase, rollback, troubleshooting, links.
 * `task` kinds render the same definition as a plain checklist.
 */
export function StepsPage({
  definition,
  state,
  kind,
  onPatch,
  busy = false,
}: {
  definition: StepsDefinition;
  state: StepsState;
  kind: string;
  onPatch: (patch: StatePatch) => void | Promise<void>;
  busy?: boolean;
}) {
  const toggles = effectiveToggles(definition, state);
  const counts = countSteps(definition, state);
  const simple = kind === "task" || kind === "habit" || kind === "reminder";
  const shell = toggles.shell;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {simple ? "Checklist" : definition.kind ?? kind}
        </span>
        <span className="text-[11px] font-[family-name:var(--font-mono)] text-ink-3">
          {counts.done}/{counts.total}
          {counts.total > 0 && counts.done === counts.total ? " · complete" : ""}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-ink-2">
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${counts.total ? Math.round((counts.done / counts.total) * 100) : 0}%` }}
        />
      </div>

      {!simple && definition.intro && (
        <section className="rounded-v2-md border border-hairline p-3 text-sm text-ink-4">
          {definition.intro.verdict_html && <Html html={definition.intro.verdict_html} />}
          {definition.intro.prerequisites && definition.intro.prerequisites.length > 0 && (
            <div className="mt-2">
              <Label>Prerequisites</Label>
              <ul className="ml-4 list-disc">
                {definition.intro.prerequisites.map((p, i) => (
                  <li key={i}>
                    <Html html={p} inline />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {definition.intro.time && definition.intro.time.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-3">Time: {definition.intro.time.join(" · ")}</p>
          )}
          {definition.intro.cost && definition.intro.cost.length > 0 && (
            <p className="text-[11px] text-ink-3">Cost: {definition.intro.cost.join(" · ")}</p>
          )}
        </section>
      )}

      {!simple && definition.toggles && Object.keys(definition.toggles).length > 0 && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {Object.entries(definition.toggles).map(([key, t]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{t.label}</span>
              {Object.entries(t.options).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={toggles[key] === val}
                  onClick={() => void onPatch({ toggles: { [key]: val } })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    toggles[key] === val
                      ? "border-glow-2/50 bg-glow-2/15 text-glow-2"
                      : "border-ink-2 text-ink-3 hover:text-ink-4"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      {!simple && definition.values && definition.values.length > 0 && (
        <section id="values" className="rounded-v2-md border border-hairline p-3">
          <Label>Values used throughout</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {definition.values.map((v) => (
              <AnswerBox
                key={v.key}
                label={v.label}
                placeholder={v.placeholder}
                value={state.answers[v.key] ?? ""}
                onSave={(val) => void onPatch({ answers: { [v.key]: val || null } })}
              />
            ))}
          </div>
        </section>
      )}

      {definition.phases.map((phase) => {
        const steps = visibleSteps(phase, toggles, definition);
        if (steps.length === 0) return null;
        const phaseDone = steps.filter((s) => state.steps[s.id]?.done).length;
        return (
          <section key={phase.id} className="rounded-v2-lg border border-hairline bg-surface-1 p-3">
            {!simple && (
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-text-0">
                  <span className="mr-2 font-[family-name:var(--font-mono)] text-[11px] text-glow-2">{phase.id}</span>
                  {phase.title}
                </h3>
                <span className="text-[11px] font-[family-name:var(--font-mono)] text-ink-3">
                  {phaseDone}/{steps.length}
                </span>
              </div>
            )}
            {!simple && phase.lede_html && <Html html={phase.lede_html} className="mt-1 text-sm text-ink-3" />}

            <ul className="mt-2 flex flex-col gap-2">
              {steps.map((s) => (
                <StepRow
                  key={s.id}
                  step={s}
                  done={!!state.steps[s.id]?.done}
                  at={state.steps[s.id]?.at}
                  simple={simple}
                  shell={shell}
                  definition={definition}
                  state={state}
                  busy={busy}
                  onTick={(done) => void onPatch({ steps: { [s.id]: done } })}
                  onAnswer={(k, v) => void onPatch({ answers: { [k]: v || null } })}
                />
              ))}
            </ul>

            {!simple && phase.verify_html && phase.verify_html.length > 0 && (
              <div className="mt-3 rounded-sm border border-ok/30 bg-ok/5 p-2 text-sm text-ink-4">
                <Label>Verify</Label>
                <ul className="ml-4 list-disc">
                  {phase.verify_html.map((v, i) => (
                    <li key={i}>
                      <Html html={substitute(v, definition, state)} inline />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!simple && phase.why_html && (
              <div className="mt-2 text-[12px] text-ink-3">
                <Label>Why</Label>
                <Html html={phase.why_html} inline />
              </div>
            )}
          </section>
        );
      })}

      {!simple && definition.rollback_html && (
        <section className="rounded-v2-md border border-warn/30 p-3 text-sm text-ink-4">
          <Label>Rollback</Label>
          <Html html={definition.rollback_html} />
        </section>
      )}
      {!simple && definition.troubleshooting && definition.troubleshooting.length > 0 && (
        <section className="rounded-v2-md border border-hairline p-3 text-sm">
          <Label>Troubleshooting</Label>
          <ul className="mt-1 flex flex-col gap-2">
            {definition.troubleshooting.map((t, i) => (
              <li key={i}>
                <span className="text-ink-4">{t.symptom}</span>
                {t.cause && <span className="text-ink-3"> — {t.cause}</span>}
                {t.fix && (
                  <div className="text-ink-3">
                    Fix: <Html html={t.fix} inline />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!simple && definition.links && definition.links.length > 0 && (
        <section className="text-sm">
          <Label>Links</Label>
          <ul className="mt-1 flex flex-col gap-1">
            {definition.links.map((l, i) => {
              const url = substitute(l.url, definition, state);
              return (
                <li key={i}>
                  {unresolved(url) ? (
                    <a href="#values" className="text-warn hover:underline">
                      {l.label} (fill in the values first)
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="text-glow-2 hover:underline">
                      {l.label}
                    </a>
                  )}
                  {l.note && <span className="text-ink-3"> — {l.note}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const ACTOR_LABEL: Record<string, string> = { "claude-code": "Claude Code", you: "You", gate: "GATE" };
const ACTOR_TONE: Record<string, string> = {
  "claude-code": "border-glow-2/40 bg-glow-2/10 text-glow-2",
  you: "border-accent/40 bg-accent/10 text-accent",
  gate: "border-warn/50 bg-warn/15 text-warn",
};
const WHERE_GLYPH: Record<string, string> = {
  dashboard: "🖥",
  terminal: "⌨",
  "claude-code": "◆",
  browser: "🌐",
  page: "📄",
  decision: "⚖",
};

function StepRow({
  step,
  done,
  at,
  simple,
  shell,
  definition,
  state,
  busy,
  onTick,
  onAnswer,
}: {
  step: Step;
  done: boolean;
  at?: string;
  simple: boolean;
  shell?: string;
  definition: StepsDefinition;
  state: StepsState;
  busy: boolean;
  onTick: (done: boolean) => void;
  onAnswer: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(!done);
  const whereUrl = step.where?.url ? substitute(step.where.url, definition, state) : null;
  const hasBody =
    !simple &&
    (!!step.body_html || (step.blocks?.length ?? 0) > 0 || (step.fields?.length ?? 0) > 0 || (step.notes?.length ?? 0) > 0);

  return (
    <li className={`rounded-v2-md border px-3 py-2 ${done ? "border-ok/30 bg-ok/5" : "border-hairline"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={(e) => onTick(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--glow-1)]"
          aria-label={`Step ${step.id} done`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!simple && (
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-3">{step.id}</span>
            )}
            <button
              type="button"
              onClick={() => hasBody && setOpen((v) => !v)}
              className={`text-left text-sm ${done ? "text-ink-3 line-through" : "text-text-0"}`}
            >
              {step.title}
            </button>
            {step.actor && (
              <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${ACTOR_TONE[step.actor] ?? ""}`}>
                {ACTOR_LABEL[step.actor] ?? step.actor}
              </span>
            )}
            {step.route && (
              <span
                className="rounded-sm border border-ink-2 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ink-3"
                title="Only applies on this route / device; a test keeps it visible so every pass counts the same steps"
              >
                {routeLabel(definition, step.route)}
              </span>
            )}
            {step.where && (
              whereUrl && !unresolved(whereUrl) ? (
                <a
                  href={whereUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-ink-2 px-2 py-0.5 text-[10px] text-glow-2 hover:underline"
                >
                  {WHERE_GLYPH[step.where.kind ?? "page"] ?? ""} {step.where.label}
                </a>
              ) : whereUrl ? (
                <a href="#values" className="rounded-full border border-warn/40 px-2 py-0.5 text-[10px] text-warn">
                  {step.where.label} (needs a value)
                </a>
              ) : (
                <span className="rounded-full border border-ink-2 px-2 py-0.5 text-[10px] text-ink-3">
                  {WHERE_GLYPH[step.where.kind ?? "page"] ?? ""} {step.where.label}
                </span>
              )
            )}
            {done && at && (
              <span className="text-[10px] text-ink-3">
                {new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {hasBody && open && (
            <div className="mt-2 flex flex-col gap-2 text-sm text-ink-4">
              {step.body_html && <Html html={substitute(step.body_html, definition, state)} />}
              {step.blocks?.map((b, i) => {
                const text = b.shells ? (b.shells[shell ?? ""] ?? Object.values(b.shells)[0] ?? "") : (b.text ?? "");
                return <CodeBlock key={i} label={b.label} text={substitute(text, definition, state)} />;
              })}
              {step.fields && step.fields.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {step.fields.map((f) => (
                    <AnswerBox
                      key={f.key}
                      label={f.label}
                      placeholder={f.placeholder}
                      value={state.answers[f.key] ?? ""}
                      onSave={(v) => onAnswer(f.key, v)}
                    />
                  ))}
                </div>
              )}
              {step.notes?.map((n, i) => (
                <div
                  key={i}
                  className={`rounded-sm border px-2 py-1 text-[12px] ${
                    n.kind === "security" || n.kind === "warn"
                      ? "border-warn/40 bg-warn/5 text-ink-4"
                      : "border-ink-2 text-ink-3"
                  }`}
                >
                  <Html html={substitute(n.html, definition, state)} inline />
                </div>
              ))}
              {step.after_html && (
                <div className="text-[12px] text-ink-3">
                  After it reports: <Html html={substitute(step.after_html, definition, state)} inline />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{children}</div>;
}

function Html({ html, className = "", inline = false }: { html: string; className?: string; inline?: boolean }) {
  const clean = sanitizeHtml(html);
  return inline ? (
    <span className={`[&_a]:text-glow-2 [&_a]:underline [&_code]:rounded-sm [&_code]:bg-ink-2 [&_code]:px-1 ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
  ) : (
    <div
      className={`prose-sm [&_a]:text-glow-2 [&_a]:underline [&_code]:rounded-sm [&_code]:bg-ink-2 [&_code]:px-1 [&_p+p]:mt-2 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

function CodeBlock({ label, text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-sm border border-ink-2 bg-ink-0/60">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-3">
        <span>{label ?? "copy"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="hover:text-ink-4"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-2 pb-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-4">{text}</pre>
    </div>
  );
}

function AnswerBox({
  label,
  placeholder,
  value,
  onSave,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onSave: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <input
        className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0 outline-none focus:ring-1 focus:ring-glow-2/60"
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== value) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}
