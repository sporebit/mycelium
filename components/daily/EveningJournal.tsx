"use client";

/**
 * The Day log's evening conversation, on the close screen once the day is
 * closed: the same exchange the Telegram bot has (claude/daylog-spec.md §4),
 * on the same engine and transcript. "Evening. <what the day looked like>.
 * Talk, Quick or Skip?", then the interview, then the score line, then the
 * recap with a link to the entry and how many items wait for review.
 *
 * One transcript: a day started on Telegram carries on here and the other
 * way round, and once it has started the evening message is not sent.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { DayRow, TranscriptEntry } from "@/lib/daylog/engine";
import { seedsLine } from "@/lib/daylog/seeds";

type Payload = { day: DayRow; score_keys: string[]; enabled?: boolean; pending?: number };
type TurnReply = { reply: string; state: "open" | "scores" | "closed"; missing: string[]; day: DayRow; error?: string };

const INPUT =
  "w-full min-h-[44px] resize-none rounded-v2-md border border-hairline bg-surface-0 px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:border-glow focus:outline-none";

async function post(url: string, body?: unknown): Promise<TurnReply> {
  const r = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as TurnReply;
  if (!r.ok) throw new Error(j.error ?? "That did not go through. Nothing was lost; try again.");
  return j;
}

function Bubble({ entry }: { entry: Pick<TranscriptEntry, "role" | "text"> }) {
  const mine = entry.role === "user";
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-v2-md px-3 py-2 text-sm ${
          mine ? "bg-glow-3/40 text-text-hi" : entry.role === "system" ? "bg-surface-2/60 italic text-text-lo" : "bg-surface-2 text-text-mid"
        }`}
      >
        {entry.text}
      </div>
    </li>
  );
}

export function EveningJournal({ date }: { date: string }) {
  const key = `/api/journal/days/${date}`;
  const { data, mutate } = useApi<Payload>(key, { revalidateOnFocus: false });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recap, setRecap] = useState<string | null>(null);
  const endRef = useRef<HTMLLIElement>(null);

  const day = data?.day ?? null;
  const count = day?.transcript?.length ?? 0;
  useEffect(() => {
    if (count) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  if (!data || !day || data.enabled === false || day.mode === "legacy") return null;

  const run = async (body: unknown) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await post(`${key}/messages`, body);
      if (r.state === "closed") setRecap(r.day.status === "skipped" ? "Logged." : r.reply);
      // a turn that closes the day also writes scenes and review items, so refetch then
      await mutate((cur) => (cur ? { ...cur, day: r.day } : cur), { revalidate: r.state === "closed" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };
  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void run({ text });
  };
  const wrapUp = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await post(`${key}/close`);
      if (r.state === "closed") setRecap(r.reply);
      await mutate((cur) => (cur ? { ...cur, day: r.day } : cur), { revalidate: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const notStarted = day.status === "pending" || day.status === "prompted";
  const live = day.status === "open" || day.status === "closing";
  const done = day.status === "closed" || day.status === "skipped";
  const transcript = day.transcript ?? [];
  const opener = `Evening.${seedsLine(day.seeds) ? ` ${seedsLine(day.seeds)}` : ""} Talk, Quick or Skip?`;
  const pending = data.pending ?? 0;

  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="evening-journal">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm text-text-mid">Day log</h2>
        <Link href={`/journal/${date}`} className="text-xs text-text-lo underline-offset-4 hover:text-text-hi hover:underline">
          Open the day
        </Link>
      </div>

      <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" aria-live="polite">
        {notStarted && transcript.length === 0 ? <Bubble entry={{ role: "assistant", text: opener }} /> : null}
        {transcript.map((e, i) => (
          <Bubble key={i} entry={e} />
        ))}
        {done && recap && !transcript.some((e) => e.role !== "user" && e.text === recap) ? <Bubble entry={{ role: "assistant", text: recap }} /> : null}
        <li ref={endRef} aria-hidden />
      </ul>

      {notStarted ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void run({ start: "talk" })}>
            Talk
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void run({ start: "quick" })}>
            Quick
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void run({ start: "skip" })}>
            Skip
          </Button>
        </div>
      ) : null}

      {live ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              aria-label="Your reply"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={day.status === "closing" ? "The scores, e.g. 4 3 5 2" : "Say what happened… ('done' to wrap up)"}
              className={INPUT}
            />
            <Button size="sm" variant="primary" loading={busy} disabled={!draft.trim()} onClick={send}>
              Send
            </Button>
          </div>
          <button type="button" disabled={busy} onClick={() => void wrapUp()} className="self-start text-xs text-text-lo underline-offset-4 hover:text-text-mid hover:underline disabled:opacity-50">
            {day.status === "closing" ? "Close with what I have" : "Wrap up"}
          </button>
        </div>
      ) : null}

      {done ? (
        <p className="text-sm text-text-mid">
          {day.status === "closed" ? "Written up." : Object.keys(day.scores ?? {}).length ? "Scores logged." : "Not logged."}{" "}
          <Link href={`/journal/${date}`} className="text-glow-2 underline-offset-4 hover:underline">
            Read the entry
          </Link>
          {pending > 0 ? (
            <>
              {" · "}
              <Link href="/organisation/captures/review" className="text-glow-2 underline-offset-4 hover:underline">
                <span className="font-mono tabular-nums">{pending}</span> to review
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {err ? (
        <p role="alert" className="text-sm text-v2-warn">
          {err}
        </p>
      ) : null}
    </Surface>
  );
}
