"use client";

/**
 * A deck of cards answered one at a time by swiping or by two buttons
 * (master run §5: "right = accept the suggested filing, left = fix").
 *
 * Used by the evening close for today's open items, and by capture review
 * and finance for their own cards. The deck knows nothing about what a card
 * means: the caller gives each card a face and the two answers.
 *
 * The buttons are the real controls; the swipe is a shortcut for them. So
 * it works with a keyboard, a screen reader and a mouse, and nothing is
 * lost if a swipe is not recognised. With reduced motion the card does not
 * fly off: it is simply replaced.
 */
import { type ReactNode, useCallback, useRef, useState } from "react";
import { Button, Surface } from "@/components/ui";

export type DeckCard = {
  id: string;
  face: ReactNode;
  /** The answer a swipe to the right gives, and its button label. */
  right: { label: string; value: string };
  /** The answer a swipe to the left gives, and its button label. */
  left: { label: string; value: string };
  /** Extra answers shown as smaller buttons under the card. */
  more?: Array<{ label: string; value: string }>;
};

const THRESHOLD = 90;

export function SwipeDeck({
  cards,
  onAnswer,
  empty,
}: {
  cards: DeckCard[];
  /** Resolve when the answer is saved; reject (or return false) to put the card back. */
  onAnswer: (card: DeckCard, value: string) => Promise<boolean | void>;
  empty?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = useRef<number | null>(null);

  const card = cards[index];

  const answer = useCallback(
    async (value: string) => {
      if (!card || busy) return;
      setBusy(true);
      setFailed(false);
      try {
        const ok = await onAnswer(card, value);
        if (ok === false) throw new Error("not saved");
        setIndex((i) => i + 1);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
        setDx(0);
      }
    },
    [busy, card, onAnswer],
  );

  if (!card) return <>{empty ?? null}</>;

  const leaning = dx > THRESHOLD ? "right" : dx < -THRESHOLD ? "left" : null;

  return (
    <div className="flex flex-col gap-3" data-testid="swipe-deck">
      <p className="font-mono text-xs tabular-nums text-text-lo" aria-live="polite">
        {index + 1} of {cards.length}
      </p>
      <Surface
        className="touch-pan-y select-none p-5 motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)]"
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
        onPointerDown={(e: React.PointerEvent) => {
          if (busy) return;
          start.current = e.clientX;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e: React.PointerEvent) => {
          if (start.current !== null) setDx(e.clientX - start.current);
        }}
        onPointerUp={() => {
          const moved = dx;
          start.current = null;
          if (moved > THRESHOLD) void answer(card.right.value);
          else if (moved < -THRESHOLD) void answer(card.left.value);
          else setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
        data-testid="deck-card"
      >
        {card.face}
        {leaning ? (
          <p className="mt-3 text-sm text-text-mid" aria-hidden>
            {leaning === "right" ? card.right.label : card.left.label}
          </p>
        ) : null}
      </Surface>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => answer(card.left.value)}>
          {card.left.label}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => answer(card.right.value)}>
          {card.right.label}
        </Button>
      </div>
      {card.more?.length ? (
        <div className="flex flex-wrap gap-2">
          {card.more.map((m) => (
            <Button key={m.value} size="sm" disabled={busy} onClick={() => answer(m.value)}>
              {m.label}
            </Button>
          ))}
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-v2-warn">
          That did not save. Nothing was lost; try again.
        </p>
      ) : null}
    </div>
  );
}
