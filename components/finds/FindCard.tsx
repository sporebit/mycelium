/**
 * A find as a swipe card face for the weekly close-out (lane B2's deck):
 * title, where it was seen or the verdict's one line, the verdict badge,
 * and the link. `findCardToDeckCard` is the adapter lib/finds/cards.ts
 * names; the integrator adds one line where the close-out builds its decks.
 */
import type { DeckCard } from "@/components/daily/SwipeDeck";
import type { FindCard } from "@/lib/finds/cards";

export function FindFace({ card }: { card: FindCard }) {
  return (
    <div className="flex flex-col gap-2" data-testid="find-face">
      <span className="text-[11px] uppercase tracking-[0.08em] text-text-lo">A find · {card.badge}</span>
      <p className="text-lg text-text-hi" style={{ textWrap: "balance" }}>
        {card.title}
      </p>
      <p className="text-sm text-text-mid">{card.line}</p>
      <a href={card.url} target="_blank" rel="noreferrer noopener" className="truncate text-xs text-glow underline-offset-2 hover:underline">
        {card.url.replace(/^https:\/\//, "")}
      </a>
    </div>
  );
}

export function findCardToDeckCard(card: FindCard): DeckCard {
  return { id: card.id, face: <FindFace card={card} />, right: card.right, left: card.left };
}
