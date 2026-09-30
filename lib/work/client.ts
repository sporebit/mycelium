"use client";

/**
 * Work — what every Work page shares on the client: the meta hook, a fetch
 * that surfaces the API's own error message, href helpers and date
 * formatting. SWR keys are always the raw API path (lib/data/useApi).
 */
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import { workPrefs, type UiPrefs } from "@/lib/settings/uiPrefs";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { toJql, type WorkQuery } from "./query";
import type { WorkMeta, WorkStatus, WorkTicket } from "./types";

export const META_KEY = "/api/work/meta";

export function useWorkMeta() {
	const { data, error, isLoading, mutate } = useApi<WorkMeta>(META_KEY, { revalidateOnFocus: false, dedupingInterval: 30_000 });
	return { meta: data ?? null, error, isLoading, reload: mutate };
}

export class WorkError extends Error {
	readonly status: number;
	readonly pos: number | null;
	constructor(message: string, status: number, pos: number | null = null) {
		super(message);
		this.name = "WorkError";
		this.status = status;
		this.pos = pos;
	}
}

/** fetch + JSON, throwing the API's `error` text so the UI can show it as it is. */
export async function workFetch<T = unknown>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	let json: unknown = null;
	try {
		json = await res.json();
	} catch {
		/* no body */
	}
	if (!res.ok) {
		const j = (json ?? {}) as { error?: string; pos?: number };
		throw new WorkError(j.error ?? `Request failed (${res.status})`, res.status, typeof j.pos === "number" ? j.pos : null);
	}
	return json as T;
}

/** Revalidate every cached Work list: searches, boards, backlogs, home, project lists. */
export function refreshWork(): void {
	void globalMutate((key) => typeof key === "string" && key.startsWith("/api/work/") && key !== META_KEY, undefined, { revalidate: true });
}

export const issueHref = (key: string | null | undefined, id?: string) => `/work/browse/${encodeURIComponent(key ?? id ?? "")}`;
export const projectHref = (key: string, tab: "" | "board" | "backlog" | "settings" = "") => `/work/projects/${encodeURIComponent(key)}${tab ? `/${tab}` : ""}`;
export const issuesHref = (jql: string) => `/work/issues?jql=${encodeURIComponent(jql)}`;
export const filterHref = (slug: string) => `/work/issues?filter=${encodeURIComponent(slug)}`;
export const docHref = (spaceKey: string, pageId?: string) => `/docs/${encodeURIComponent(spaceKey)}${pageId ? `/${pageId}` : ""}`;

export function searchPath(q: WorkQuery | string, limit = 50, offset = 0): string {
	const jql = typeof q === "string" ? q : toJql(q);
	return `/api/work/tickets?jql=${encodeURIComponent(jql)}&limit=${limit}&offset=${offset}`;
}

export function todayLondon(): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function fmtDay(d: string | null | undefined): string {
	if (!d) return "";
	const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
	if (Number.isNaN(dt.getTime())) return d;
	const sameYear = dt.getFullYear() === new Date().getFullYear();
	return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export function fmtWhen(iso: string | null | undefined): string {
	if (!iso) return "";
	const dt = new Date(iso);
	if (Number.isNaN(dt.getTime())) return iso;
	const mins = Math.round((Date.now() - dt.getTime()) / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} min ago`;
	if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
	if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))} d ago`;
	return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

export function isOverdue(t: Pick<WorkTicket, "due" | "status">, today = todayLondon()): boolean {
	return !!t.due && t.due < today && t.status?.category !== "done";
}

/** The statuses a ticket of this project and type can take, from meta. */
export function statusesFor(meta: WorkMeta | null, projectId: string | null, typeId: string | null): WorkStatus[] {
	if (!meta) return [];
	const map = meta.workflow_map;
	const pick =
		map.find((m) => m.project_id === projectId && m.issue_type_id === typeId && projectId && typeId) ??
		map.find((m) => m.project_id === projectId && m.issue_type_id === null && projectId) ??
		map.find((m) => m.project_id === null && m.issue_type_id === typeId && typeId);
	const live = meta.workflows.filter((w) => !w.archived_at);
	const wf = (pick && live.find((w) => w.id === pick.workflow_id)) ?? live.find((w) => w.is_default) ?? live[0];
	return wf ? [...wf.statuses].sort((a, b) => a.sort_order - b.sort_order) : [];
}

export type WorkPrefs = UiPrefs["work"];

/** `ui_prefs.work` — preferences live in ui_prefs, never localStorage (spec-index rule). */
export function useWorkPrefs() {
	const { prefs, setPrefs, isLoading } = useUiPrefs();
	const work = workPrefs(prefs);
	const setWork = (patch: Partial<WorkPrefs>) => setPrefs({ work: { ...work, ...patch } });
	return { work, setWork, isLoading };
}

/** Put a key at the front of the recently-viewed list. */
export function withRecent(recent: string[], key: string): string[] {
	return [key, ...recent.filter((k) => k !== key)].slice(0, 20);
}
