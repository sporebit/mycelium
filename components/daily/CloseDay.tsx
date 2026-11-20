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
  captures: CaptureCard[];
  summary: { done?: number; moved?: number; dropped?: number };
};

type CaptureCard = { id: string; text: string; title: string; kind: string; held: boolean; suggestion: string; has_audio: boolean; from_dump: boolean };

/** What a capture can be changed to from the card. Anything that needs more detail (a reminder's time, a ticket's project) opens the full editor. */
const FIX_KINDS: Array<{ kind: string; label: string }> = [
  { kind: "task", label: "A task" },
  { kind: "idea", label: "An idea" },
  { kind: "note", label: "A note" },
  { kind: "purchase", label: "Something to buy" },
  { kind: "journal", label: "Day log" },
];

async function reviewCapture(id: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/captures/${id}/review`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

export function CloseDay({ chime = true }: { chime?: boolean }) {
  const { data: view, error: loadError, mutate } = useApi<CloseView>("/api/daily/close", { revalidateOnFocus: false });
  const [saveError, setSaveError] = useState<string | null>(null);
  const error = saveError ?? (loadError ? "The close did not load. Nothing was lost; try again." : null);
  const [closing, setClosing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  // A capture swiped left: its card turns into "what is it, then?".
  const [fixing, setFixing] = useState<CaptureCard | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

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

  const captureCards: DeckCard[] = (view.captures ?? [])
    .filter((cap) => !answered.has(cap.id))
    .map((cap) => ({
      id: cap.id,
      face: (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-lo">
            {cap.suggestion}
            {cap.from_dump ? " · from a longer recording" : ""}
          </span>
          <p className="whitespace-pre-line text-text-hi">{cap.text}</p>
        </div>
      ),
      right: { label: "Accept", value: "accept" },
      left: { label: "Fix", value: "fix" },
      more: [{ label: "Discard", value: "discard" }],
    }));

  const answerCapture = async (card: DeckCard, value: string): Promise<boolean | "stay"> => {
    const cap = (view.captures ?? []).find((x) => x.id === card.id);
    if (!cap) return true;
    if (value === "fix") {
      setFixing(cap);
      return "stay"; // the card waits while it is fixed
    }
    const ok = await reviewCapture(cap.id, { action: value === "discard" ? "discard" : "approve" });
    if (ok) setAnswered((s) => new Set(s).add(cap.id));
    return ok;
  };

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

      {!closed && cards.length === 0 && captureCards.length > 0 && !fixing ? (
        <div className="flex flex-col gap-2" data-testid="capture-deck">
          <h2 className="text-sm text-text-mid">Captured today and before</h2>
          <SwipeDeck key={captureCards.map((x) => x.id).join(",")} cards={captureCards} onAnswer={answerCapture} />
        </div>
      ) : null}

      {fixing ? (
        <Surface className="flex flex-col gap-3 p-5" data-testid="capture-fix">
          <p className="whitespace-pre-line text-text-hi">{fixing.text}</p>
          <p className="text-sm text-text-lo">What is it?</p>
          <div className="flex flex-wrap gap-2">
            {FIX_KINDS.map((k) => (
              <Button
                key={k.kind}
                size="sm"
                onClick={async () => {
                  if (await reviewCapture(fixing.id, { action: "reroute", kind: k.kind })) {
                    setAnswered((s) => new Set(s).add(fixing.id));
                    setFixing(null);
                  }
                }}
              >
                {k.label}
              </Button>
            ))}
            <a className="inline-flex min-h-[32px] items-center px-3 text-sm text-text-mid underline underline-offset-4" href={`/organisation/captures/review?focus=${fixing.id}`}>
              More choices
            </a>
            <Button size="sm" onClick={() => setFixing(null)}>
              Back
            </Button>
          </div>
        </Surface>
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
