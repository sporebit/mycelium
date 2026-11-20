/**
 * The sources whose cards appear in the weekly close-out, in the order they
 * get room. One line per feature (see closeoutCards.ts).
 */
import type { CloseoutCardSource } from "./closeoutCards";
import { answerFind, findsCloseoutCards } from "@/lib/finds/cards";
import { exitFinishLine, finishLineFor } from "./finishServer";
import { BUTTONS } from "./words";

/**
 * The finish line (research §6 measure 3, second half): things above 80%
 * done that have sat for over two weeks. Finish, good enough, or drop —
 * the three exits the finish line already offers, offered once a week here
 * so a stuck thing is looked at when there is time to look.
 */
export const finishLineSource: CloseoutCardSource = {
  key: "finish",
  label: "Nearly done",
  async load(db, uid, _week, room) {
    const items = await finishLineFor(db, uid);
    return items
      .filter((i) => i.idle_days >= 14)
      .slice(0, room)
      .map((i) => ({
        id: i.id,
        source: "finish",
        title: i.title,
        detail: [i.left, i.next_step ? `Next: ${i.next_step}` : null, `Untouched for ${i.idle_days} days.`].filter(Boolean).join(" "),
        href: `/work?ticket=${i.key ?? i.id}`,
        right: { label: BUTTONS.finish, value: "finish" },
        left: { label: BUTTONS.drop, value: "drop" },
        more: [{ label: BUTTONS.goodEnough, value: "good_enough" }],
      }));
  },
  async answer(db, uid, cardId, value) {
    if (value !== "finish" && value !== "drop" && value !== "good_enough") return false;
    return (await exitFinishLine(db, uid, cardId, value)).ok;
  },
};

/**
 * The week's finds (master run §12): the top five unanswered, advisories
 * first, then by verdict. Keep or Skip; the week's page holds the rest.
 */
export const findsSource: CloseoutCardSource = {
  key: "finds",
  label: "This week's finds",
  async load(db, _uid, _week, room) {
    const cards = await findsCloseoutCards(db, new Date(), Math.min(5, room));
    return cards.map((c) => ({
      id: c.id,
      source: "finds",
      title: c.title,
      detail: `${c.badge}. ${c.line}`,
      href: c.url,
      right: c.right,
      left: c.left,
    }));
  },
  async answer(db, _uid, cardId, value) {
    if (value !== "keep" && value !== "skip") return false;
    return (await answerFind(db, cardId, value)) !== null;
  },
};

export const SOURCES: readonly CloseoutCardSource[] = [finishLineSource, findsSource];
