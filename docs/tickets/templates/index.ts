/**
 * Repo-authored ticket templates (spec §9.3). Add a JSON file next to this
 * index and list it here; POST /api/tickets/templates?sync=1 upserts them
 * with origin = repo (the nightly cron calls it too). Bump `version` in the
 * JSON to push a change over an existing row.
 */
import bookHoliday from "./book-holiday.json";
import startAReturn from "./start-a-return.json";
import cutoverRunbook from "./cutover-runbook.json";
import smokeTest from "./smoke-test-parts-b-h.json";
import setupTokens from "./setup-tokens-webhooks.json";
import smokeQuotesDaylog from "./smoke-test-quotes-daylog.json";
import smokeDaylogPartB from "./smoke-test-daylog-part-b.json";
import smokeDaylogPartC from "./smoke-test-daylog-part-c.json";

export type RepoTemplate = {
  slug: string;
  name: string;
  kind: string;
  version: number;
  definition: unknown;
};

export const REPO_TEMPLATES: RepoTemplate[] = [bookHoliday, startAReturn, cutoverRunbook, smokeTest, setupTokens, smokeQuotesDaylog, smokeDaylogPartB, smokeDaylogPartC] as RepoTemplate[];
