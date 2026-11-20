"use client";

/**
 * The weekly close-out (master run §6; research rules 23, 25, 32): a
 * session that only finishes. The plan is said at the start and the box of
 * forty-five minutes begins; the week's fill and lifetime totals are shown
 * (no streak to break); one section that has gone quiet is raised with the
 * direct question why — Keep, Pause or Retire; other features' cards are
 * dealt from one deck; and in the first close-out of a month the eight
 * measures of the month before sit beside the month before that. "Close
 * the week" always works.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Surface } from "@/components/ui";
import type { CloseoutCard } from "@/lib/daily/closeoutCards";
import type { CloseoutView } from "@/lib/daily/closeoutServer";
import { useApi } from "@/lib/data/useApi";
import { CLOSEOUT, fillLine, lifetimeLine } from "@/lib/daily/words";
import { playChime } from "./chime";
import { type DeckCard, SwipeDeck } from "./SwipeDeck";

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; view?: CloseoutView; error?: string }> {
  const res = await fetch("/api/daily/closeout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as CloseoutView & { error?: string };
  return res.ok ? { ok: true, view: json } : { ok: false, error: json.error };
}

export function Closeout({ chime = true }: { chime?: boolean }) {
  const { data: view, error: loadError, mutate } = useApi<CloseoutView>("/api/daily/closeout", { revalidateOnFocus: false });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState("");
  const [report, setReport] = useState("");
  const [why, setWhy] = useState("");
  const [screen, setScreen] = useState("");
  const [helping, setHelping] = useState("");
  const [costing, setCosting] = useState("");
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  // One tick a minute while the box is running, so the minutes left are true without a reload.
  const [, setTick] = useState(0);
  const running = !!view?.row.started_at && !view?.row.finished_at;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      void mutate();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [running, mutate]);

  const act = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      setBusy(label);
      setSaveError(null);
      try {
        const res = await post(body);
        if (!res.ok) throw new Error(res.error ?? "That did not save.");
        if (res.view) await mutate(res.view, { revalidate: false });
        return true;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "That did not save. Nothing was lost; try again.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [mutate],
  );

  if (!view) {
    return (
      <Surface className="p-6" aria-busy="true">
        <p className="text-text-mid">{loadError ? "The close-out did not load. Nothing was lost; try again." : "Loading the week…"}</p>
      </Surface>
    );
  }

  const error = saveError;
  const started = !!view.row.started_at;
  const finished = !!view.row.finished_at;
  const boxOver = started && !finished && view.box_left === 0;

  const cards: DeckCard[] = view.cards
    .filter((c) => !answered.has(`${c.source}:${c.id}`))
    .map((c: CloseoutCard) => ({
      id: `${c.source}:${c.id}`,
      face: (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-lo">{c.source === "finish" ? "Nearly done" : c.source}</span>
          <p className="text-xl leading-tight text-text-hi [text-wrap:balance]">{c.title}</p>
          {c.detail ? <p className="text-text-mid">{c.detail}</p> : null}
          {c.href ? (
            <Link href={c.href} className="text-sm text-text-mid underline underline-offset-4">
              Open
            </Link>
          ) : null}
        </div>
      ),
      right: c.right ?? { label: "Seen", value: "seen" },
      left: c.left ?? { label: "Later", value: "later" },
      more: c.more,
    }));

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4" data-testid="closeout">
      <Surface className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl text-text-hi">{finished ? CLOSEOUT.closed : CLOSEOUT.title}</h1>
          <span className="font-mono text-sm tabular-nums text-text-lo">{view.week}</span>
        </div>
        {!started ? (
          <>
            <p className="text-sm text-text-lo">
              {CLOSEOUT.notYet} {WEEKDAY[view.slot.day]} at {view.slot.time}. {CLOSEOUT.planHint}
            </p>
            <label className="flex flex-col gap-1 text-sm text-text-mid">
              {CLOSEOUT.planAsk}
              <input
                data-testid="closeout-plan"
                className="min-h-[40px] rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                maxLength={500}
              />
            </label>
            <Button variant="primary" disabled={busy !== null} onClick={() => act("start", { action: "start", plan })} data-testid="closeout-begin">
              {CLOSEOUT.begin}
            </Button>
          </>
        ) : (
          <>
            {view.row.plan ? <p className="text-text-mid">“{view.row.plan}”</p> : null}
            {!finished ? (
              <div className="flex items-baseline justify-between rounded-v2-md bg-surface-2 px-4 py-3" role="timer" aria-live="off" data-testid="closeout-box">
                <span className="text-sm text-text-mid">{boxOver ? CLOSEOUT.boxOver : "Time left in the box"}</span>
                {!boxOver ? <span className="font-mono text-2xl tabular-nums text-text-hi">{view.box_left} min</span> : null}
              </div>
            ) : null}
          </>
        )}
      </Surface>

      <Surface className="flex flex-col gap-2 p-5" data-testid="closeout-fill">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-lo">{CLOSEOUT.fill}</h2>
        <p className="text-text-hi">{fillLine(view.fill)}</p>
        <h2 className="mt-2 text-[11px] uppercase tracking-[0.18em] text-text-lo">{CLOSEOUT.lifetime}</h2>
        <p className="text-text-mid">{lifetimeLine(view.lifetime)}</p>
      </Surface>

      {started && !finished && view.section ? (
        <Surface className="flex flex-col gap-3 p-5" data-testid="closeout-section">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-lo">{CLOSEOUT.section}</h2>
          {view.row.section_decision ? (
            <p className="text-text-hi">
              {view.section.label}: {view.row.section_decision === "keep" ? CLOSEOUT.keep : view.row.section_decision === "pause" ? CLOSEOUT.pause : CLOSEOUT.retire}.
              {view.row.section_why ? <span className="text-text-mid"> “{view.row.section_why}”</span> : null}
            </p>
          ) : (
            <>
              <p className="text-text-hi">{view.section.question}</p>
              <label className="flex flex-col gap-1 text-sm text-text-mid">
                {CLOSEOUT.whyAsk} <span className="text-text-lo">{CLOSEOUT.whyHint}</span>
                <input data-testid="closeout-why" className="min-h-[40px] rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={1000} />
              </label>
              <div className="flex flex-wrap gap-2">
                {(["keep", "pause", "retire"] as const).map((d) => (
                  <Button key={d} size="sm" variant={d === "keep" ? "primary" : "ghost"} disabled={busy !== null} onClick={() => act(d, { action: "section", key: view.section?.key, decision: d, why })} data-testid={`closeout-${d}`}>
                    {d === "keep" ? CLOSEOUT.keep : d === "pause" ? CLOSEOUT.pause : CLOSEOUT.retire}
                  </Button>
                ))}
                <Link href={view.section.href} className="inline-flex min-h-[32px] items-center px-3 text-sm text-text-mid underline underline-offset-4">
                  Open {view.section.label}
                </Link>
              </div>
            </>
          )}
        </Surface>
      ) : null}
      {started && !finished && !view.section ? <p className="px-1 text-sm text-text-lo">{CLOSEOUT.nothingQuiet}</p> : null}

      {started && !finished && cards.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="closeout-deck">
          <SwipeDeck
            cards={cards}
            onAnswer={async (card, value) => {
              const [source, ...rest] = card.id.split(":");
              const id = rest.join(":");
              if (value === "seen" || value === "later") {
                setAnswered((s) => new Set(s).add(card.id));
                return true;
              }
              const res = await post({ action: "card", source, id, value });
              if (res.ok) {
                setAnswered((s) => new Set(s).add(card.id));
                if (chime && value === "finish") playChime(false);
              } else setSaveError(res.error ?? "That did not take.");
              return res.ok;
            }}
          />
        </div>
      ) : null}

      {view.measures ? (
        <Surface className="flex flex-col gap-2 p-5" data-testid="closeout-measures">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-lo">
            {CLOSEOUT.measuresTitle} · {view.measures.current.month}
          </h2>
          <p className="text-sm text-text-lo">{CLOSEOUT.measuresHint}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-lo">
                <th className="py-1 font-normal">Measure</th>
                <th className="py-1 text-right font-normal">{view.measures.current.month}</th>
                <th className="py-1 text-right font-normal">{view.measures.previous?.month ?? "before"}</th>
                <th className="py-1 text-right font-normal">Aim</th>
              </tr>
            </thead>
            <tbody>
              {view.measures.rows.map((r) => (
                <tr key={r.key} className="border-t border-hairline">
                  <td className="py-1 text-text-hi">{r.label}</td>
                  <td className="py-1 text-right font-mono tabular-nums text-text-hi">{r.now}</td>
                  <td className="py-1 text-right font-mono tabular-nums text-text-mid">{r.before}</td>
                  <td className="py-1 text-right text-text-lo">{r.aim}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.measures.current.partner.helping || view.measures.current.partner.costing ? (
            <p className="text-sm text-text-mid">
              {CLOSEOUT.partnerOne} “{view.measures.current.partner.helping ?? "—"}” · {CLOSEOUT.partnerTwo} “{view.measures.current.partner.costing ?? "—"}”
            </p>
          ) : null}
        </Surface>
      ) : null}

      {started && !finished ? (
        <Surface className="flex flex-col gap-3 p-5" data-testid="closeout-finish">
          <label className="flex flex-col gap-1 text-sm text-text-mid">
            {CLOSEOUT.reportAsk}
            <input data-testid="closeout-report" className="min-h-[40px] rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi" value={report} onChange={(e) => setReport(e.target.value)} maxLength={1000} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-mid">
            {CLOSEOUT.screenAsk}
            <input data-testid="closeout-screen" type="number" min={0} max={10080} className="min-h-[40px] w-40 rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi" value={screen} onChange={(e) => setScreen(e.target.value)} />
          </label>
          {view.measures ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm text-text-mid">
                {CLOSEOUT.partnerOne}
                <input className="min-h-[40px] rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi" value={helping} onChange={(e) => setHelping(e.target.value)} maxLength={500} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-mid">
                {CLOSEOUT.partnerTwo}
                <input className="min-h-[40px] rounded-v2-sm border border-hairline bg-surface-2 px-3 text-text-hi" value={costing} onChange={(e) => setCosting(e.target.value)} maxLength={500} />
              </label>
            </div>
          ) : null}
          <Button
            variant="primary"
            disabled={busy !== null}
            data-testid="closeout-close"
            onClick={async () => {
              const screenMinutes = screen.trim() === "" ? null : Number(screen);
              const ok = await act("finish", { action: "finish", report, screen_minutes: Number.isFinite(screenMinutes as number) ? screenMinutes : null, partner_answers: { helping, costing } });
              if (ok && chime) playChime(true);
            }}
          >
            {CLOSEOUT.finish}
          </Button>
        </Surface>
      ) : null}

      {finished && view.row.report ? <p className="px-1 text-text-mid">“{view.row.report}”</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-text-mid">
          {error}
        </p>
      ) : null}
    </div>
  );
}
