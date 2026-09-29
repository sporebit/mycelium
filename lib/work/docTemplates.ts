/**
 * Docs — repo page templates (claude/spec-work.md §2.6, §7). The JSON in
 * docs/docs/templates is upserted into `doc_templates` with origin = repo,
 * the way ticket templates are (lib/tickets/templates.ts). A template made
 * or edited in the UI is never overwritten, and a row already at the
 * repo's version is left alone. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { REPO_DOC_TEMPLATES } from "@/docs/docs/templates/index";
import { checkDoc } from "./doc";
import { TEMPLATE_SLUG_RE } from "./docs";

export type DocTemplateSync = { synced: string[]; skipped: string[] };

export async function syncRepoDocTemplates(supabase: SupabaseClient, spaceId: string): Promise<DocTemplateSync> {
	const synced: string[] = [];
	const skipped: string[] = [];
	const { data: existing, error } = await supabase.from("doc_templates").select("id, slug, origin, version").eq("space_id", spaceId);
	if (error) throw error;
	const bySlug = new Map(((existing ?? []) as Array<{ id: string; slug: string; origin: string; version: number }>).map((r) => [r.slug, r]));
	for (const t of REPO_DOC_TEMPLATES) {
		if (!TEMPLATE_SLUG_RE.test(t.slug) || !t.name.trim() || !Number.isInteger(t.version)) {
			skipped.push(`${t.slug} (invalid template)`);
			continue;
		}
		const problem = checkDoc(t.body);
		if (problem) {
			skipped.push(`${t.slug} (${problem})`);
			continue;
		}
		const cur = bySlug.get(t.slug);
		if (cur && cur.origin === "ui") {
			skipped.push(`${t.slug} (UI-owned)`);
			continue;
		}
		if (cur && cur.version >= t.version) {
			skipped.push(`${t.slug} (v${cur.version} current)`);
			continue;
		}
		const row = {
			slug: t.slug,
			name: t.name.trim(),
			description: t.description?.trim() || null,
			title: t.title?.trim() || null,
			body: t.body,
			shared: true,
			origin: "repo",
			version: t.version,
			updated_at: new Date().toISOString(),
		};
		const { error: writeErr } = cur
			? await supabase.from("doc_templates").update(row).eq("id", cur.id)
			: await supabase.from("doc_templates").insert({ ...row, space_id: spaceId });
		if (writeErr) skipped.push(`${t.slug} (${writeErr.message})`);
		else synced.push(t.slug);
	}
	return { synced, skipped };
}
