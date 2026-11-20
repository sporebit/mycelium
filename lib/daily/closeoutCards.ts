/**
 * Cards other features add to the weekly close-out — the way the evening
 * close takes capture and finance cards, but through one list rather than
 * one import each.
 *
 * A feature registers a SOURCE: a key, a loader that returns its cards for
 * the week, and (if its cards can be answered on the spot) an answerer.
 * The close-out asks every source in turn, catches any that fails (a fault
 * in one feature never stops the close-out), and keeps the deck within
 * MAX_CLOSEOUT_CARDS: sources earlier in the list get room first.
 *
 * To add a feature's cards: write its source next to its own code and add
 * one line to SOURCES in closeoutSources.ts. The finds feed will add its
 * top five that way.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CloseoutCard = {
  /** Unique within its source. */
  id: string;
  /** Which source made it; the answer goes back to that source. */
  source: string;
  /** What the card says, in the person's words: a title and a line or two under it. */
  title: string;
  detail?: string | null;
  /** Where the thing lives, for a tap that wants the whole of it. */
  href?: string | null;
  /** The answer a swipe to the right gives, and to the left. Omit both for a card that is read and dismissed. */
  right?: { label: string; value: string };
  left?: { label: string; value: string };
  /** Smaller answers under the card. */
  more?: Array<{ label: string; value: string }>;
};

export type CloseoutCardSource = {
  key: string;
  /** As the person would name the feature, for the card's small heading. */
  label: string;
  /** The cards for this week, at most `room` of them. */
  load: (db: SupabaseClient, uid: string, week: string, room: number) => Promise<CloseoutCard[]>;
  /** Carry out an answer. Return false when the id is unknown or the answer did not take. */
  answer?: (db: SupabaseClient, uid: string, cardId: string, value: string) => Promise<boolean>;
};

/** The deck stays small (research rule 18 holds for the week as it does for the day). */
export const MAX_CLOSEOUT_CARDS = 10;

export async function loadCloseoutCards(sources: readonly CloseoutCardSource[], db: SupabaseClient, uid: string, week: string, max: number = MAX_CLOSEOUT_CARDS): Promise<CloseoutCard[]> {
  const out: CloseoutCard[] = [];
  for (const source of sources) {
    const room = max - out.length;
    if (room <= 0) break;
    try {
      const cards = await source.load(db, uid, week, room);
      for (const c of cards.slice(0, room)) out.push({ ...c, source: source.key });
    } catch (err) {
      console.error(`[closeout] cards from ${source.key}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function answerCloseoutCard(sources: readonly CloseoutCardSource[], db: SupabaseClient, uid: string, sourceKey: string, cardId: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const source = sources.find((s) => s.key === sourceKey);
  if (!source) return { ok: false, error: "No such card." };
  if (!source.answer) return { ok: true };
  try {
    return (await source.answer(db, uid, cardId, value)) ? { ok: true } : { ok: false, error: "That did not take." };
  } catch (err) {
    console.error(`[closeout] answer to ${sourceKey}:`, err instanceof Error ? err.message : err);
    return { ok: false, error: "That did not save. Nothing was lost; try again." };
  }
}
