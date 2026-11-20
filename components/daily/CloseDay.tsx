"use client";

/**
 * The evening close (master run §6; research rule 18): two minutes, ten
 * cards at most. It opens with what got done. Each item still open gets one
 * card: Done on the right, Tomorrow on the left, Drop underneath. "Close
 * the day" is always enabled: whatever is left undecided moves to tomorrow
 * with no tally kept.
 */
import { useCallback, useState } from "react";
import { Button, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { TodayCard } from "@/lib/daily/view";
import { about, BUTTONS, LABELS } from "@/lib/daily/words";
import { playChime } from "./chime";
import { type DeckCard, SwipeDeck } from "./SwipeDeck";

type CloseView = {
  day: string;
  status: "proposed" | "accepted" | "closed";
  won: boolean;
  finished: TodayCard[];
  open: TodayCard[];
  slipped: Array<{ id: string; title: string }>;
  summary: { done?: number; moved?: number; dropped?: number };
};

export function CloseDay({ chime = true }: { chime?: boolean }) {
  const { data: view, error: loadError, mutate } = useApi<CloseView>("/api/daily/close", { revalidateOnFocus: false });
  const [saveError, setSaveError] = useState<string | null>(null);
  const error = saveError ?? (loadError ? "The close did not load. Nothing was lost; try again." : null);
  const [closing, setClosing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const closeDay = useCallback(async () => {
    setClosing(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/daily/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: Object.entries(decisions).map(([item_id, decision]) => ({ item_id, decision })) }),
      });
      if (!res.ok) throw new Error();
      if (chime) playChime(false);
      await mutate();
    } catch {
      setSaveError("The day did not close. Nothing was lost; try again.");
    } finally {
      setClosing(false);
    }
  }, [chime, decisions, mutate]);

  if (!view) {
    return (
      <Surface className="mx-auto w-full max-w-[560px] p-6" aria-busy="true">
        <p className="text-text-mid">{error ?? "Loading…"}</p>
      </Surface>
    );
  }

  const cards: DeckCard[] = view.open
    .filter((i) => !(i.item_id in decisions))
    .map((i) => ({
      id: i.item_id,
      face: (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-lo">{i.is_win ? LABELS.win : LABELS.extra}</span>
          <p className="text-xl leading-tight text-text-hi [text-wrap:balance]">{i.title}</p>
          <p className="font-mono text-sm tabular-nums text-text-lo">{about(i.minutes)}</p>
        </div>
      ),
      right: { label: BUTTONS.done, value: "done" },
      left: { label: BUTTONS.tomorrow, value: "tomorrow" },
      more: [
        { label: BUTTONS.goodEnough, value: "good_enough" },
        { label: BUTTONS.drop, value: "drop" },
      ],
    }));

  const closed = view.status === "closed";

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4" data-testid="close-day">
      <Surface className="flex flex-col gap-2 p-5">
        <h1 className="text-xl text-text-hi">{closed ? LABELS.dayClosed : "Today"}</h1>
        {view.finished.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {view.finished.map((i) => (
              <li key={i.item_id} className="flex items-baseline gap-2 text-text-hi">
                <span aria-hidden className="text-glow">✓</span>
                <span>{i.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-mid">Nothing finished today, and that is fine.</p>
        )}
        {view.won ? <p className="text-sm text-text-mid">{LABELS.dayWon}</p> : null}
      </Surface>

      {!closed ? (
        <SwipeDeck
          cards={cards}
          onAnswer={async (card, value) => {
            setDecisions((d) => ({ ...d, [card.id]: value }));
            return true;
          }}
          empty={view.open.length > 0 ? <p className="text-sm text-text-lo">All decided. Close the day when ready.</p> : null}
        />
      ) : null}

      {!closed ? (
        <Button variant="primary" loading={closing} onClick={closeDay} data-testid="close-the-day">
          {BUTTONS.closeDay}
        </Button>
      ) : (
        <p className="text-sm text-text-lo">
          <span className="font-mono tabular-nums">{view.summary.done ?? 0}</span> finished · <span className="font-mono tabular-nums">{view.summary.moved ?? 0}</span> moved ·{" "}
          <span className="font-mono tabular-nums">{view.summary.dropped ?? 0}</span> dropped
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-v2-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
