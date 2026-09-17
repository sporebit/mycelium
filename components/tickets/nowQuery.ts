"use client";

import { scoreTaskForContext } from "@/lib/compost/now-filter";
import type { UiPrefs } from "@/lib/settings/uiPrefs";
import { toolsForDevice } from "@/lib/tickets/categories";
import type { CurrentContext } from "@/lib/types/context";
import type { Task } from "@/lib/types/task";
import type { DeviceClass } from "./useDevice";

/**
 * One place builds the Now query so the Today block and the Now tab always
 * show the same list (spec §5, §12). The SWR key is the raw URL, so both
 * surfaces share one cache entry when their inputs match.
 */
export function nowQueryUrl(
  tp: UiPrefs["tickets"],
  device: DeviceClass,
  toolOverride: string[] | null = null,
): string {
  const tools = toolOverride ?? toolsForDevice(device);
  const sp = new URLSearchParams({ list: "now", where: tp.now_where, tools: tools.join(",") });
  if (tp.now_max_points != null) sp.set("max_points", String(tp.now_max_points));
  if (tp.now_include_backlog) sp.set("include_backlog", "1");
  return `/api/tickets?${sp.toString()}`;
}

/**
 * The FROZEN scorer (lib/compost/now-filter) receives the pre-filtered set:
 * it orders by legacy context match (where/device/energy/tag) and hides a
 * contradiction, then the API's own order (now_score, urgent, dates) breaks
 * ties. Contexts never enter the score; the score never enters the filter.
 */
export function orderForContext<T extends Task>(
  tickets: T[],
  ctx: CurrentContext,
  device: DeviceClass,
): T[] {
  const scored: Array<{ t: T; score: number; i: number }> = [];
  tickets.forEach((t, i) => {
    const { score, contradicts } = scoreTaskForContext(t, ctx, device);
    if (contradicts) return;
    scored.push({ t, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.t);
}
