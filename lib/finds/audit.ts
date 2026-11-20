/**
 * `npm audit --json`, run by the PC worker in its checkout of the repo (an
 * "npm_audit" job, pc lane, once a week). The worker posts npm's JSON as
 * the result; here it becomes advisory finds, each kept once and sent for
 * a verdict like any other. Nothing is fixed or installed by the app.
 */
import { registerJobHandler } from "@/lib/jobs/handlers";
import { recordFinds } from "./store";
import { queueVerdicts } from "./verdict";
import { parseNpmAudit } from "./watchers/advisories";

export const AUDIT_KIND = "npm_audit";

registerJobHandler(AUDIT_KIND, {
  apply: async (_job, result, db) => {
    const body = typeof result.audit === "string" ? safeParse(result.audit) : result.audit;
    const found = parseNpmAudit(body);
    if (!found.length) return;
    const { inserted } = await recordFinds(db, found);
    await queueVerdicts(db, inserted);
  },
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
