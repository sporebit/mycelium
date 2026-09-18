/**
 * Tickets — steps (the checklists spec §3.1 / §3.2 shapes, absorbed into
 * tickets.steps_definition / steps_state; tickets spec §9.2). Isomorphic.
 *
 * Definition = the authored run-book / test / guide; State = ticks (with
 * time), typed answers and toggle choices. PATCH merges per key so two
 * tabs cannot clobber each other; a null deletes a key.
 */

export type WhereKind = "dashboard" | "terminal" | "claude-code" | "browser" | "page" | "decision";
export type Actor = "claude-code" | "you" | "gate";

export type StepWhere = { label: string; url?: string | null; kind?: WhereKind };
export type StepBlock = {
  label?: string;
  text?: string;
  shells?: Record<string, string>;
  lang?: string;
};
export type StepField = { key: string; label: string; placeholder?: string; kind?: "text" | "number" | "date" };
export type StepNote = { kind?: "security" | "warn" | "info" | "tip"; html: string };
export type Step = {
  id: string;
  title: string;
  actor?: Actor;
  where?: StepWhere | null;
  /** Hidden unless the `route` toggle equals this value. */
  route?: string | null;
  body_html?: string;
  blocks?: StepBlock[];
  fields?: StepField[];
  notes?: StepNote[];
  /** "After it reports" line for claude-code steps. */
  after_html?: string;
};
export type Phase = {
  id: string;
  title: string;
  lede_html?: string;
  steps: Step[];
  verify_html?: string[];
  why_html?: string;
};
export type Toggle = { label: string; options: Record<string, string>; default: string };
export type ValueDef = { key: string; label: string; placeholder?: string };
export type StepsDefinition = {
  slug?: string;
  kind?: string;
  title?: string;
  version?: number;
  toggles?: Record<string, Toggle>;
  values?: ValueDef[];
  intro?: {
    verdict_html?: string;
    comparison?: { columns: string[]; rows: string[][] };
    changes_html?: string[];
    prerequisites?: string[];
    time?: string[];
    cost?: string[];
  };
  phases: Phase[];
  rollback_html?: string;
  troubleshooting?: Array<{ symptom: string; cause?: string; fix?: string }>;
  links?: Array<{ label: string; url: string; note?: string }>;
};

export type StepsState = {
  toggles: Record<string, string>;
  steps: Record<string, { done: boolean; at: string }>;
  answers: Record<string, string>;
};

export const EMPTY_STATE: StepsState = { toggles: {}, steps: {}, answers: {} };

export function normaliseState(s: unknown): StepsState {
  const o = (s && typeof s === "object" ? s : {}) as Partial<StepsState>;
  return {
    toggles: { ...(o.toggles ?? {}) },
    steps: { ...(o.steps ?? {}) },
    answers: { ...(o.answers ?? {}) },
  };
}

export type StatePatch = {
  toggles?: Record<string, string | null>;
  /** true = tick now; false/null = untick (deletes the key); or a full entry */
  steps?: Record<string, boolean | null | { done: boolean; at?: string }>;
  answers?: Record<string, string | null>;
};

/** Per-key merge (checklists §4): null deletes; ticks carry their time. */
export function mergeState(current: StepsState, patch: StatePatch, now = new Date()): StepsState {
  const next = normaliseState(current);
  for (const [k, v] of Object.entries(patch.toggles ?? {})) {
    if (v === null) delete next.toggles[k];
    else next.toggles[k] = String(v);
  }
  for (const [k, v] of Object.entries(patch.steps ?? {})) {
    if (v === null || v === false) delete next.steps[k];
    else if (v === true) next.steps[k] = { done: true, at: now.toISOString() };
    else if (v && typeof v === "object") {
      if (!v.done) delete next.steps[k];
      else next.steps[k] = { done: true, at: v.at ?? now.toISOString() };
    }
  }
  for (const [k, v] of Object.entries(patch.answers ?? {})) {
    if (v === null || v === "") delete next.answers[k];
    else next.answers[k] = String(v);
  }
  return next;
}

/** Effective toggle values: state over definition defaults. */
export function effectiveToggles(def: StepsDefinition | null | undefined, state: StepsState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, t] of Object.entries(def?.toggles ?? {})) out[k] = state.toggles[k] ?? t.default;
  return out;
}

/**
 * Which toggle a step's `route` value belongs to: the first toggle whose
 * options include it (the checklists spec named the toggle `route`; a
 * definition may call it `device`, `shell`, …). Null when no toggle owns it.
 */
export function routeToggleKey(def: StepsDefinition | null | undefined, route: string): string | null {
  for (const [key, t] of Object.entries(def?.toggles ?? {})) {
    if (route in (t.options ?? {})) return key;
  }
  return null;
}

/** Human label for a step's route ("PC first", "Staging rehearsal"). */
export function routeLabel(def: StepsDefinition | null | undefined, route: string): string {
  const key = routeToggleKey(def, route);
  return (key && def?.toggles?.[key]?.options?.[route]) || route;
}

/**
 * Steps visible under the current toggles. `route` is presentational
 * (StepsPage shows a chip) except in the one case the checklists spec
 * defined: a run-book with a toggle literally named `route` hides the steps
 * whose route is not the chosen one. A `test` never hides — the denominator
 * must not move between toggle positions or no single pass can reach 100 %.
 * No generalised {toggle, value} gate: if a real branch is ever needed that
 * is a separate design.
 */
export function visibleSteps(
  phase: Phase,
  toggles: Record<string, string>,
  def?: StepsDefinition | null,
): Step[] {
  if ((def?.kind ?? "") === "test") return phase.steps;
  const hasRouteToggle = def ? !!def.toggles?.route : true;
  if (!hasRouteToggle) return phase.steps;
  return phase.steps.filter((s) => !s.route || toggles.route === s.route);
}

export function countSteps(
  def: StepsDefinition | null | undefined,
  state: StepsState,
): { done: number; total: number } {
  if (!def) return { done: 0, total: 0 };
  const toggles = effectiveToggles(def, state);
  let done = 0;
  let total = 0;
  for (const p of def.phases ?? []) {
    for (const s of visibleSteps(p, toggles, def)) {
      total += 1;
      if (state.steps[s.id]?.done) done += 1;
    }
  }
  return { done, total };
}

/** `{{key}}` substitution from answers, falling back to values[].placeholder. */
export function substitute(
  text: string | null | undefined,
  def: StepsDefinition | null | undefined,
  state: StepsState,
): string {
  if (!text) return "";
  const placeholders = new Map((def?.values ?? []).map((v) => [v.key, v.placeholder ?? `<${v.key}>`]));
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const a = state.answers[key];
    if (a !== undefined && a !== "") return a;
    return placeholders.get(key) ?? `<${key}>`;
  });
}

/** A link whose substitution still holds `<…>` should point at the values step, not 404. */
export function unresolved(s: string): boolean {
  return /<[^>]+>/.test(s);
}

/** A plain checklist: one phase of plain steps from lines of text. */
export function definitionFromLines(title: string, lines: string[]): StepsDefinition {
  return {
    kind: "task",
    title,
    version: 1,
    phases: [
      {
        id: "1",
        title: "Steps",
        steps: lines
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l, i) => ({ id: `1.${i + 1}`, title: l })),
      },
    ],
  };
}

export function isStepsDefinition(v: unknown): v is StepsDefinition {
  if (!v || typeof v !== "object") return false;
  const d = v as StepsDefinition;
  return Array.isArray(d.phases) && d.phases.every((p) => p && typeof p.id === "string" && Array.isArray(p.steps));
}
