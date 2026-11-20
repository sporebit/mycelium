/**
 * The week's top five finds as swipe cards for the weekly close-out.
 *
 * ── INTEGRATION (lane B2's close-out) ────────────────────────────────────
 * The close-out deck takes DeckCard[] (components/daily/SwipeDeck.tsx),
 * whose `face` is a ReactNode. This module is server-side and returns the
 * data for the face instead; the one line to add where the close-out
 * builds its decks is:
 *
 *   decks.push(...(await findsCloseoutCards(db, now)).map(findCardToDeckCard));
 *
 * with `findCardToDeckCard` from components/finds/FindCard.tsx, and the
 * deck's answer handler calling PATCH /api/finds/<id> { answer } (or
 * answerFind(db, id, answer) from ./store when it runs on the server).
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFinds } from "./store";
import { type FindRow, SOURCE_LABEL, type VerdictCall, VERDICT_LABEL } from "./types";

export type FindCard = {
  id: string;
  url: string;
  title: string;
  /** One line under the title: the verdict's summary, or where it was seen. */
  line: string;
  badge: string;
  call: VerdictCall | null;
  right: { label: "Keep"; value: "keep" };
  left: { label: "Skip"; value: "skip" };
};

const RANK: Record<VerdictCall, number> = { use_now: 0, maybe_later: 1, skip: 2 };

/** Order: advisories first, then Use now, Maybe later, the rest; unanswered only. Pure. */
export function rankFinds(rows: readonly FindRow[]): FindRow[] {
  return rows
    .filter((r) => !r.answer)
    .slice()
    .sort((a, b) => {
      const adv = Number(b.kind === "advisory") - Number(a.kind === "advisory");
      if (adv) return adv;
      const ra = a.verdict ? RANK[a.verdict.verdict] : 3;
      const rb = b.verdict ? RANK[b.verdict.verdict] : 3;
      if (ra !== rb) return ra - rb;
      return Date.parse(b.found_at) - Date.parse(a.found_at);
    });
}

export function toCard(r: FindRow): FindCard {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    line: r.verdict?.summary ?? `Seen on ${SOURCE_LABEL[r.source]}${r.source_ref ? ` (${r.source_ref})` : ""}; no verdict yet.`,
    badge: r.verdict ? VERDICT_LABEL[r.verdict.verdict] : r.kind,
    call: r.verdict?.verdict ?? null,
    right: { label: "Keep", value: "keep" },
    left: { label: "Skip", value: "skip" },
  };
}

/** The week's top `limit` unanswered finds as cards. */
export async function findsCloseoutCards(db: SupabaseClient, now: Date = new Date(), limit = 5): Promise<FindCard[]> {
  const rows = await listFinds(db, { now, days: 7 });
  return rankFinds(rows).slice(0, limit).map(toCard);
}

export { answerFind } from "./store";
