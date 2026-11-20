"use client";

/**
 * The focus card: one thing, a first step of five minutes or less, how long
 * it takes, and what comes after (master run §6; research rules 9–12, 21,
 * 24). Three buttons before it is started (Start / Not now / Swap) and
 * three once the countdown is running or has ended (Done / 10 more minutes /
 * Park). No button asks for a reason.
 *
 * Feedback lands at once: the card redraws from the server's reply, and the
 * tap itself is acknowledged before that reply arrives (the pressed state
 * and the optimistic "saving" mark), so the 300 ms the research asks for
 * does not depend on the network.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { TodayCard, TodayView } from "@/lib/daily/view";
import { about, BUTTONS, LABELS } from "@/lib/daily/words";
import { playChime } from "./chime";

type Wip = { limit: number; in_progress: Array<{ id: string; ticket_key: string | null; title: string }> };

function remaining(endsAt: string | null, now: number): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FocusCard({ initial, chime = true }: { initial: TodayView | null; chime?: boolean }) {
  // The page arrives with today in it; the hook only fetches when it did not.
  const { data: fetched, error: loadError } = useApi<TodayView>(initial ? null : "/api/daily/today", { revalidateOnFocus: false });
  const [changed, setView] = useState<TodayView | null>(null);
  const view = changed ?? initial ?? fetched ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? (loadError ? "Today did not load. Nothing was lost; try again." : null);
  const [panel, setPanel] = useState<"none" | "swap" | "park" | "wip" | "rest">("none");
  const [wip, setWip] = useState<Wip | null>(null);
  const [note, setNote] = useState("");
  const [justWon, setJustWon] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // One tick a second while a countdown is showing; none otherwise.
  const card = view?.current ?? null;
  const running = card?.state === "started" && !!card.timer_ends_at;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const act = useCallback(
    async (itemId: string, body: Record<string, unknown>, label: string) => {
      setBusy(label);
      setError(null);
      try {
        const res = await fetch(`/api/daily/items/${itemId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({}))) as TodayView & { error?: string; wip?: Wip; just_won?: boolean };
        if (res.status === 409 && json.wip) {
          setWip(json.wip);
          setPanel("wip");
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "That did not save.");
        setView(json);
        setPanel("none");
        setNote("");
        setNow(Date.now());
        if (body.action === "done" || body.action === "good_enough") {
          if (chime) playChime(json.just_won === true);
          if (json.just_won) setJustWon(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not save. Nothing was lost; try again.");
      } finally {
        setBusy(null);
      }
    },
    [chime],
  );

  const accept = useCallback(async () => {
    setBusy("accept");
    try {
      const res = await fetch("/api/daily/today", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
      if (res.ok) setView((await res.json()) as TodayView);
    } finally {
      setBusy(null);
    }
  }, []);

  if (!view) {
    return (
      <Surface className="p-6" aria-busy="true">
        <p className="text-text-mid">{error ?? "Loading today…"}</p>
      </Surface>
    );
  }

  const left = card ? remaining(card.timer_ends_at, now) : null;
  const timeUp = card?.state === "started" && left === 0;
  const rest = view.items.filter((i) => i.item_id !== card?.item_id && (i.state === "planned" || i.state === "started"));

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4" data-testid="focus-card">
      {justWon || (view.won && !card) ? (
        <Surface className="growth-in p-4" role="status">
          <p className="text-text-hi">{LABELS.dayWon}</p>
        </Surface>
      ) : null}

      {card ? (
        <Surface className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-text-mid">{card.is_win ? LABELS.win : LABELS.extra}</span>
            {card.key ? <span className="font-mono text-xs text-text-lo">{card.key}</span> : null}
          </div>

          <h1 className="text-2xl leading-tight text-text-hi [text-wrap:balance]">{card.title}</h1>
          {card.project ? <p className="-mt-2 text-sm text-text-lo">{card.project}</p> : null}

          <dl className="flex flex-col gap-2">
            <div>
              <dt className="text-xs text-text-lo">{LABELS.firstStep}</dt>
              <dd className="text-text-hi">{card.first_step}</dd>
            </div>
            {card.left_off ? (
              <div>
                <dt className="text-xs text-text-lo">{LABELS.leftOff}</dt>
                <dd className="text-text-mid">{card.left_off}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline gap-3">
              <dd className="font-mono text-sm tabular-nums text-text-mid">{about(card.minutes)}</dd>
              {card.why ? <dd className="text-sm text-text-lo">{card.why}</dd> : null}
            </div>
          </dl>

          {card.state === "started" && left !== null ? (
            <div className="flex items-baseline justify-between rounded-v2-md bg-surface-2 px-4 py-3" role="timer" aria-live="off">
              <span className="text-sm text-text-mid">{timeUp ? LABELS.timerDone : "Time left"}</span>
              <span className="font-mono text-3xl tabular-nums text-text-hi" data-testid="countdown">
                {clock(left)}
              </span>
            </div>
          ) : null}

          {view.needs_ok && card.state === "planned" ? (
            <p className="text-sm text-text-lo">This is a suggestion for today. It becomes the plan when you start, or by itself in a while.</p>
          ) : null}

          {card.state === "started" ? (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="primary" loading={busy === "done"} onClick={() => act(card.item_id, { action: "done" }, "done")}>
                {BUTTONS.done}
              </Button>
              <Button loading={busy === "more"} onClick={() => act(card.item_id, { action: "more_time", minutes: 10 }, "more")}>
                {BUTTONS.moreTime}
              </Button>
              <Button onClick={() => setPanel(panel === "park" ? "none" : "park")} aria-expanded={panel === "park"}>
                {BUTTONS.park}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="primary" loading={busy === "start"} onClick={() => act(card.item_id, { action: "start" }, "start")}>
                {BUTTONS.start}
              </Button>
              <Button loading={busy === "not_now"} onClick={() => act(card.item_id, { action: "not_now" }, "not_now")}>
                {BUTTONS.notNow}
              </Button>
              <Button onClick={() => setPanel(panel === "swap" ? "none" : "swap")} aria-expanded={panel === "swap"} disabled={view.swap.length === 0}>
                {BUTTONS.swap}
              </Button>
            </div>
          )}

          {panel === "swap" ? (
            <div className="flex flex-col gap-2" data-testid="swap-options">
              {view.swap.map((o) => (
                <button
                  key={o.ticket_id}
                  type="button"
                  className="flex min-h-[44px] items-baseline justify-between gap-3 rounded-v2-md border border-hairline-strong px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow"
                  onClick={() => act(card.item_id, { action: "swap", with_ticket_id: o.ticket_id }, "swap")}
                >
                  <span className="text-text-hi">{o.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-lo">{about(o.minutes)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {panel === "park" ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act(card.item_id, { action: "park", note }, "park");
              }}
            >
              <label className="text-xs text-text-lo" htmlFor="park-note">
                {LABELS.leftOff} (optional)
              </label>
              <input
                id="park-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                className="min-h-[44px] rounded-v2-md border border-hairline-strong bg-surface-0 px-3 text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow"
              />
              <Button type="submit" loading={busy === "park"}>
                {BUTTONS.park}
              </Button>
            </form>
          ) : null}

          {panel === "wip" && wip ? (
            <div className="flex flex-col gap-2" data-testid="wip-panel">
              <p className="text-sm text-text-mid">{LABELS.parkOneFirst}</p>
              {wip.in_progress.slice(0, 5).map((t) => {
                const inPlan = view.items.find((i) => i.ticket_id === t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-v2-md border border-hairline px-3 py-2">
                    <span className="text-text-hi">{t.title}</span>
                    {inPlan ? (
                      <Button size="sm" onClick={() => act(inPlan.item_id, { action: "park" }, "park-other")}>
                        {BUTTONS.park}
                      </Button>
                    ) : (
                      <a className="text-sm text-text-mid underline underline-offset-4" href={t.ticket_key ? `/work/browse/${t.ticket_key}` : "/work"}>
                        Open
                      </a>
                    )}
                  </div>
                );
              })}
              <Button size="sm" onClick={() => act(card.item_id, { action: "start", force: true }, "start")}>
                Start this anyway
              </Button>
            </div>
          ) : null}

          {view.then ? (
            <p className="border-t border-hairline pt-3 text-sm text-text-lo">
              {LABELS.then}: <span className="text-text-mid">{view.then.title}</span>
            </p>
          ) : null}
        </Surface>
      ) : (
        <Surface className="flex flex-col gap-2 p-6">
          <p className="text-text-hi">{view.status === "closed" ? LABELS.dayClosed : view.counts.planned > 0 ? "Nothing left on today." : LABELS.nothingToday}</p>
          {view.status !== "closed" && view.counts.planned === 0 ? <p className="text-sm text-text-lo">{LABELS.nothingTodayHint}</p> : null}
        </Surface>
      )}

      {view.needs_ok && card ? (
        <Button loading={busy === "accept"} onClick={accept}>
          {BUTTONS.looksRight}
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-v2-warn">
          {error}
        </p>
      ) : null}

      {rest.length > 0 ? (
        <details className="rounded-v2-md border border-hairline px-4 py-3" open={panel === "rest"}>
          <summary className="cursor-pointer text-sm text-text-mid">The rest of today</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rest.slice(0, 4).map((i) => (
              <RestRow key={i.item_id} item={i} />
            ))}
          </ul>
        </details>
      ) : null}

      {view.slipped.length > 0 ? <SlippedCards view={view} onChange={setView} /> : null}
    </div>
  );
}

function RestRow({ item }: { item: TodayCard }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-text-hi">{item.title}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-text-lo">{about(item.minutes)}</span>
    </li>
  );
}

function SlippedCards({ view, onChange }: { view: TodayView; onChange: (v: TodayView) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (ticketId: string, decision: "redate" | "someday" | "drop") => {
    setBusy(`${ticketId}:${decision}`);
    try {
      const res = await fetch("/api/daily/slipped", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket_id: ticketId, decision }) });
      if (res.ok) onChange((await res.json()) as TodayView);
    } finally {
      setBusy(null);
    }
  };
  // One at a time: a single card, never a list of everything that slipped.
  const t = view.slipped[0];
  return (
    <Surface className="flex flex-col gap-3 p-4" data-testid="slipped-card">
      <p className="text-sm text-text-lo">{LABELS.slipped}</p>
      <p className="text-text-hi">{t.title}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" loading={busy === `${t.id}:redate`} onClick={() => decide(t.id, "redate")}>
          {BUTTONS.reDate}
        </Button>
        <Button size="sm" loading={busy === `${t.id}:someday`} onClick={() => decide(t.id, "someday")}>
          {BUTTONS.someday}
        </Button>
        <Button size="sm" loading={busy === `${t.id}:drop`} onClick={() => decide(t.id, "drop")}>
          {BUTTONS.drop}
        </Button>
      </div>
    </Surface>
  );
}
