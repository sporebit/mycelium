/**
 * Repo-authored ticket templates (spec §9.3). Add a JSON file next to this
 * index and list it here; POST /api/tickets/templates?sync=1 upserts them
 * with origin = repo (the nightly cron calls it too). Bump `version` in the
 * JSON to push a change over an existing row.
 */
import bookHoliday from "./book-holiday.json";
import startAReturn from "./start-a-return.json";
import cutoverRunbook from "./cutover-runbook.json";

export type RepoTemplate = {
  slug: string;
  name: string;
  kind: string;
  version: number;
  definition: unknown;
};

export const REPO_TEMPLATES: RepoTemplate[] = [bookHoliday, startAReturn, cutoverRunbook] as RepoTemplate[];
