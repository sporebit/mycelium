"use client";

/**
 * Where the editor's @ and # suggestions come from (claude/spec-work.md
 * Part C). Both lists are fetched once and filtered here, because the
 * Tiptap suggestion plugin asks on every keystroke: members and People
 * from one call each, tickets by a small JQL search.
 */
import { quoteValue } from "@/lib/work/query";
import type { WorkMeta, WorkTicket } from "@/lib/work/types";
import type { EditorSources } from "./extensions";
import type { SuggestItem } from "./suggestion";

type PersonRow = { id: string; first_name: string; last_name: string | null; display_name: string | null; relationship: string | null };

const TTL = 60_000;
let peopleCache: { at: number; items: SuggestItem[] } | null = null;
let peopleInFlight: Promise<SuggestItem[]> | null = null;

function personLabel(p: PersonRow): string {
	return (p.display_name ?? `${p.first_name} ${p.last_name ?? ""}`).trim() || "Someone";
}

async function loadPeople(): Promise<SuggestItem[]> {
	if (peopleCache && Date.now() - peopleCache.at < TTL) return peopleCache.items;
	if (peopleInFlight) return peopleInFlight;
	peopleInFlight = (async () => {
		const [metaRes, peopleRes] = await Promise.all([fetch("/api/work/meta"), fetch("/api/people?tier=person")]);
		const items: SuggestItem[] = [];
		if (metaRes.ok) {
			const meta = (await metaRes.json()) as WorkMeta;
			for (const u of meta.people) items.push({ id: u.id, label: u.name, kind: "user", hint: meta.me?.id === u.id ? "Member · you" : "Member" });
		}
		if (peopleRes.ok) {
			const j = (await peopleRes.json()) as { people?: PersonRow[] };
			for (const p of j.people ?? []) items.push({ id: p.id, label: personLabel(p), kind: "person", hint: p.relationship ?? "Person" });
		}
		peopleCache = { at: Date.now(), items };
		return items;
	})().finally(() => {
		peopleInFlight = null;
	});
	return peopleInFlight;
}

function matches(q: string, ...fields: Array<string | undefined>): boolean {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

export const defaultSources: EditorSources = {
	async people(query) {
		const all = await loadPeople();
		const hits = all.filter((p) => matches(query, p.label));
		// members first, then People; a prefix match ahead of one in the middle
		const needle = query.trim().toLowerCase();
		hits.sort((a, b) => {
			const ka = a.kind === "user" ? 0 : 1;
			const kb = b.kind === "user" ? 0 : 1;
			if (ka !== kb) return ka - kb;
			const pa = needle && a.label.toLowerCase().startsWith(needle) ? 0 : 1;
			const pb = needle && b.label.toLowerCase().startsWith(needle) ? 0 : 1;
			return pa - pb || a.label.localeCompare(b.label);
		});
		return hits.slice(0, 8);
	},
	async tickets(query, signal) {
		const q = query.trim();
		const jql = q ? `text ~ ${quoteValue(q)} ORDER BY updated DESC` : "ORDER BY updated DESC";
		const res = await fetch(`/api/work/tickets?jql=${encodeURIComponent(jql)}&limit=8`, { signal });
		if (!res.ok) return [];
		const j = (await res.json()) as { tickets?: WorkTicket[] };
		return (j.tickets ?? [])
			.filter((t) => t.key)
			.map((t) => ({ id: t.key as string, label: t.title, kind: "ticket" as const, hint: t.status?.name }));
	},
};

/** Drop the cached lists, for a page that just created a person. */
export function resetEditorSources(): void {
	peopleCache = null;
}
