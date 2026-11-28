/**
 * Field guide validation (design §1 D16; brief 12.8 "or the guide is
 * rejected"). Only a definition that says `format: "field-guide"` is held
 * to the rule; every older definition passes as long as it is a definition
 * at all (phases with steps). Pure and isomorphic: the steps PATCH route,
 * the unit test over docs/guides and docs/checklists, and the authoring
 * README all use this one function.
 *
 * The rule, for a Field guide:
 *  - every `actor: "you"` step (or a step with no actor) carries where (a label), a value (a block,
 *    `value_html`, or a `body_html` that states the exact thing), what you should see
 *    (`expect_html`) and how long (`minutes` above zero);
 *  - a phase's own steps (actor "you") add up to 20 minutes or less.
 */
import { isStepsDefinition, type StepsDefinition } from "@/lib/tickets/steps";

/** The most of Phil's own minutes a sitting may hold (D1 authors to 15; D16 refuses above 20). */
export const MAX_OWN_MINUTES = 20;

export type Validation = { ok: true; errors: [] } | { ok: false; errors: string[] };

export function validateDefinition(def: unknown): Validation {
  if (!isStepsDefinition(def)) return { ok: false, errors: ["A definition needs phases[], each with an id and steps[]."] };
  const d = def as StepsDefinition;
  if (d.format !== "field-guide") return { ok: true, errors: [] };

  const errors: string[] = [];
  for (const phase of d.phases) {
    let own = 0;
    for (const step of phase.steps) {
      // In a Field guide a step with no actor is his own.
      if ((step.actor ?? "you") !== "you") continue;
      const missing: string[] = [];
      if (!step.where || typeof step.where.label !== "string" || !step.where.label.trim()) missing.push("where");
      // The value: a copy block or value_html, or the step's own body stating the exact thing
      // (decisions.md 2026-11-28: steps like "Decide each" have nothing copyable).
      const hasValue =
        (step.blocks?.length ?? 0) > 0 ||
        (typeof step.value_html === "string" && step.value_html.trim() !== "") ||
        (typeof step.body_html === "string" && step.body_html.trim() !== "");
      if (!hasValue) missing.push("a value (blocks, value_html or body_html)");
      if (typeof step.expect_html !== "string" || !step.expect_html.trim()) missing.push("expect_html");
      if (typeof step.minutes !== "number" || !(step.minutes > 0)) missing.push("minutes");
      else own += step.minutes;
      if (missing.length) errors.push(`Step ${step.id} (${step.title}) has no ${missing.join(", ")}.`);
    }
    if (own > MAX_OWN_MINUTES) {
      errors.push(`Phase ${phase.id} (${phase.title}) holds ${own} minutes of your own steps; a sitting holds ${MAX_OWN_MINUTES} or less.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}
