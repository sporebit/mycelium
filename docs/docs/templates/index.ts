/**
 * Repo-authored page templates (claude/spec-work.md §2.6, §7). Add a JSON
 * file next to this index and list it here; GET
 * /api/work/docs/templates?sync=1 upserts them with origin = repo. Bump
 * `version` in the JSON to push a change over an existing row.
 */
import meetingNotes from "./meeting-notes.json";
import decisionRecord from "./decision-record.json";
import howTo from "./how-to.json";
import projectBrief from "./project-brief.json";

export type RepoDocTemplate = {
	slug: string;
	name: string;
	description: string;
	version: number;
	title: string;
	body: unknown;
};

export const REPO_DOC_TEMPLATES: RepoDocTemplate[] = [meetingNotes, decisionRecord, howTo, projectBrief] as RepoDocTemplate[];
