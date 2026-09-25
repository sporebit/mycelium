"use client";

import { scoreTaskForContext } from "@/lib/compost/now-filter";
import type { UiPrefs } from "@/lib/settings/uiPrefs";
import { toolsForDevice } from "@/lib/tickets/categories";
import type { CurrentContext } from "@/lib/types/context";
import type { Task } from "@/lib/types/task";
import type { DeviceClass } from "./useDevice";
import { withArea } from "@/lib/tickets/areaChip";

/**
 * One place builds the Now query so the Today block, the Now card and the
 * Now tab always show the same list (spec §5, §12).
 *
 * The request fetches the *candidate set* once (category next/doing, the
 * time window, no open blockers, optionally backlog) and the Where / Tool /
 * Energy chips are applied on the client with applyNowContext(). The URL
 * is the SWR key, so this keeps one warm cache entry per include-backlog
 * value instead of a cold fetch on every chip tap.
 */
export function nowQueryUrl(tp: UiPrefs["tickets"]): string {
  const sp = new URLSearchParams({ list: "now", where: "any", tools: "*" });
  if (tp.now_include_backlog) sp.set("include_backlog", "1");
  // The Area chip (tasks-merge M2) narrows Now like every other tab.
  return withArea(`/api/tickets?${sp.toString()}`, tp.area);
}

export type NowChips = { where: "anywhere" | "home" | "out"; tools: string[]; maxPoints: number | null; sprintOnly: boolean };

export function chipsFor(tp: UiPrefs["tickets"], device: DeviceClass, toolOverride: string[] | null = null): NowChips {
  // The sprint chip only exists when the Area chip is a project (M3), so the preference only bites then.
  return { where: tp.now_where, tools: toolOverride ?? toolsForDevice(device), maxPoints: tp.now_max_points, sprintOnly: tp.now_sprint_only && tp.area.kind === "project" };
}

/** The spec §5 predicates, applied client-side (same semantics as the server's). */
export function applyNowContext<T extends Task>(tickets: T[], chips: NowChips): T[] {
  return tickets.filter((t) => {
    const w = t.where_ctx ?? "anywhere";
    if (!(w === "anywhere" || w === chips.where)) return false;
    const tools = t.tools ?? ["none"];
    if (!(tools.includes("none") || tools.some((x) => chips.tools.includes(x)))) return false;
    if (chips.maxPoints != null && t.points != null && t.points > chips.maxPoints) return false;
    if (chips.sprintOnly && t.sprint_status !== "active") return false;
    return true;
  });
}

/**
 * The FROZEN scorer (lib/compost/now-filter) receives the pre-filtered set:
 * it orders by legacy context match (where/device/energy/tag) and hides a
 * contradiction, then the API's own order (now_score, urgent, dates) breaks
 * ties. Contexts never enter the score; the score never enters the filter.
 */
export function orderForContext<T extends Task>(tickets: T[], ctx: CurrentContext, device: DeviceClass): T[] {
  const scored: Array<{ t: T; score: number; i: number }> = [];
  tickets.forEach((t, i) => {
    const { score, contradicts } = scoreTaskForContext(t, ctx, device);
    if (contradicts) return;
    scored.push({ t, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.t);
}
