/**
 * PhirstMaxx engine — concrete occurrences of blocks for display. A
 * recurring block becomes one entry per hit, tagged with the London day it
 * starts on, so a timeline can draw a fortnight without knowing RRULEs.
 * Generic over the caller's block shape: the engine only needs the times,
 * the rule and whether the block was turned down.
 */
import type { Interval } from "../types";
import { expandRecurrence } from "./recurrence";
import { londonDate } from "./time";

export type ExpandableBlock = {
  id: string;
  start: number;
  end: number;
  rule?: string | null;
  exceptions?: string[];
  /** A block the person turned down (one their partner added for them) is never shown. */
  rejected?: boolean;
};

export type DisplayBlock<T extends ExpandableBlock> = {
  key: string;
  block: T;
  start: number;
  end: number;
  /** London date of the start. */
  day: string;
  recurring: boolean;
};

export function expandForDisplay<T extends ExpandableBlock>(blocks: T[], range: Interval): DisplayBlock<T>[] {
  const out: DisplayBlock<T>[] = [];
  for (const block of blocks) {
    if (block.rejected) continue;
    const rule = block.rule ?? null;
    for (const o of expandRecurrence({ start: block.start, end: block.end, rule, exceptions: block.exceptions }, range)) {
      const day = londonDate(o.start);
      out.push({ key: `${block.id}:${day}`, block, start: o.start, end: o.end, day, recurring: Boolean(rule) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
