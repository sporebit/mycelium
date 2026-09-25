/**
 * The Area chip's stored choice (tasks-merge M2) → query params. Pure, so the
 * Now query, the GTD tabs, the counts, the Clarify stack, the classic board
 * and the dates table all narrow the same way. Stored in ui_prefs.tickets.area
 * (never localStorage).
 */
import type { UiPrefs } from "@/lib/settings/uiPrefs";

export type AreaChoice = UiPrefs["tickets"]["area"];

export const AREA_ALL: AreaChoice = { kind: "all", project_id: null };

/** `area=technical`, `area=life`, `project=<id>`, or nothing for All. */
export function areaParams(area: AreaChoice | null | undefined): Record<string, string> {
  if (!area) return {};
  if (area.kind === "technical" || area.kind === "life") return { area: area.kind };
  if (area.kind === "project" && area.project_id) return { project: area.project_id };
  return {};
}

/** Append the Area chip to a URL that may already have a query string. */
export function withArea(url: string, area: AreaChoice | null | undefined): string {
  const params = areaParams(area);
  const keys = Object.keys(params);
  if (keys.length === 0) return url;
  const sp = new URLSearchParams(params);
  return `${url}${url.includes("?") ? "&" : "?"}${sp.toString()}`;
}

export function areaLabel(area: AreaChoice | null | undefined, projectName?: string | null): string {
  if (!area || area.kind === "all") return "All";
  if (area.kind === "technical") return "Technical";
  if (area.kind === "life") return "Life";
  return projectName ?? "Project";
}
