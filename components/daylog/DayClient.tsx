"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { DayRow, TranscriptEntry } from "@/lib/daylog/engine";
import { shiftDate } from "@/lib/daylog/day";

type Payload = { day: DayRow; score_keys: string[] };
type TurnReply = { reply: string; state: "open" | "scores" | "closed"; missing: string[]; day: DayRow; error?: string };

const input = "w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
}
function heading(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: body === undefined ? "POST" : "POST", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `${r.status}`);
  return j;
}

/**
 * /journal/[date] (spec §6, Part A): summary (editable), scores row,
 * the read-only transcript with a composer while the day is open or
 * awaiting scores, and Talk / Quick / Skip when it has not started.
 */
export function DayClient({ date }: { date: string }) {
  const key = `/api/journal/days/${date}`;
  const { data, mutate } = useApi<Payload>(key);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);

  const day = data?.day ?? null;
  const keys = data?.score_keys ?? [];

  const apply = (r: TurnReply) => void mutate((cur) => (cur ? { ...cur, day: r.day } : cur), { revalidate: false });
  const run = async (fn: () => Promise<TurnReply>) => {
    setBusy(true);
    setErr(null);
    try {
      apply(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || !day) return;
    setDraft("");
    await run(() => post<TurnReply>(`${key}/messages`, { text }));
  };
  const setScore = async (k: string, v: number | null) => {
    if (!day) return;
    setBusy(true);
    try {
      const r = await fetch(key, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scores: { [k]: v } }) });
      const j = (await r.json()) as { day?: DayRow; error?: string };
      if (!r.ok || !j.day) throw new Error(j.error ?? `${r.status}`);
      void mutate((cur) => (cur ? { ...cur, day: j.day! } : cur), { revalidate: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const saveSummary = async () => {
    if (summaryDraft === null) return;
    setBusy(true);
    try {
      const r = await fetch(key, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: summaryDraft }) });
      const j = (await r.json()) as { day?: DayRow; error?: string };
      if (!r.ok || !j.day) throw new Error(j.error ?? `${r.status}`);
      void mutate((cur) => (cur ? { ...cur, day: j.day! } : cur), { revalidate: false });
      setSummaryDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  if (!data || !day) return <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-ink-3 italic">Loading…</div>;

  const live = day.status === "open" || day.status === "closing";
  const notStarted = day.status === "pending" || day.status === "prompted";
  const transcript: TranscriptEntry[] = day.transcript ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href={`/journal/${shiftDate(date, -1)}`} className="text-text-2 hover:text-text-0" aria-label="Previous day">
            ←
          </Link>
          <h1 className="text-lg font-semibold text-text-0">{heading(date)}</h1>
          <Link href={`/journal/${shiftDate(date, 1)}`} className="text-text-2 hover:text-text-0" aria-label="Next day">
            →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-ink-4 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-text-2 font-[family-name:var(--font-mono)]">
            {day.status}
            {day.mode ? ` · ${day.mode}` : ""}
          </span>
          <Link href="/journal" className="text-xs text-glow-2 hover:underline">
            all days
          </Link>
        </div>
      </div>

      {day.legacy_journal_id && <div className="text-xs text-text-2 italic">Migrated from the old journal.</div>}

      {/* summary */}
      <section className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
        <div className="card-eyebrow flex items-center justify-between">
          <span>Entry</span>
          {summaryDraft === null ? (
            <button type="button" className="text-[10px] text-text-2 hover:text-text-0 font-[family-name:var(--font-mono)]" onClick={() => setSummaryDraft(day.summary ?? "")}>
              EDIT
            </button>
          ) : (
            <span className="flex gap-2">
              <button type="button" className="text-[10px] text-glow-1 font-[family-name:var(--font-mono)]" onClick={() => void saveSummary()} disabled={busy}>
                SAVE
              </button>
              <button type="button" className="text-[10px] text-text-2 font-[family-name:var(--font-mono)]" onClick={() => setSummaryDraft(null)}>
                CANCEL
              </button>
            </span>
          )}
        </div>
        {summaryDraft !== null ? (
          <textarea rows={6} value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} className={`${input} resize-y`} />
        ) : day.summary ? (
          <p className="text-sm text-text-0 whitespace-pre-wrap font-[family-name:var(--font-display)] text-base leading-relaxed">{day.summary}</p>
        ) : (
          <p className="text-sm text-text-2 italic">{live ? "The entry is written when the day closes." : notStarted ? "Nothing yet." : "No entry."}</p>
        )}
      </section>

      {/* scores */}
      {keys.length > 0 && (
        <section className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
          <div className="card-eyebrow">Scores</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {keys.map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <Mono className="text-[10px] uppercase tracking-[0.15em] text-text-2">{k}</Mono>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      onClick={() => void setScore(k, day.scores?.[k] === n ? null : n)}
                      className={`h-7 w-7 rounded-sm text-xs font-[family-name:var(--font-mono)] ${day.scores?.[k] === n ? "bg-glow-3 text-glow-1" : "bg-ink-2 text-text-2 hover:text-text-0"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* conversation */}
      <section className="rounded-md bg-ink-1 p-4 flex flex-col gap-3">
        <div className="card-eyebrow flex items-center justify-between">
          <span>Conversation</span>
          {(live || notStarted) && day.status !== "pending" && (
            <button type="button" className="text-[10px] text-text-2 hover:text-warn font-[family-name:var(--font-mono)]" disabled={busy} onClick={() => void run(() => post<TurnReply>(`${key}/close`))}>
              {day.status === "closing" ? "CLOSE WITH WHAT I HAVE" : "WRAP UP"}
            </button>
          )}
        </div>
        {transcript.length === 0 ? (
          <div className="text-xs text-text-2 italic">No messages.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {transcript.map((e, i) => (
              <li key={i} className={`flex ${e.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${e.role === "user" ? "bg-glow-3/40 text-text-0" : e.role === "system" ? "bg-ink-2/60 text-text-2 italic" : "bg-ink-2 text-text-1"}`}>
                  {e.text}
                  <Mono className="block mt-1 text-[9px] text-text-2">
                    {fmtTime(e.at)} · {e.channel}
                  </Mono>
                </div>
              </li>
            ))}
          </ul>
        )}
        {notStarted && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void run(() => post<TurnReply>(`${key}/messages`, { start: "talk" }))}>
              TALK
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => void run(() => post<TurnReply>(`${key}/messages`, { start: "quick" }))}>
              QUICK
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => void run(() => post<TurnReply>(`${key}/messages`, { start: "skip" }))}>
              SKIP — SCORES ONLY
            </button>
          </div>
        )}
        {live && (
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={day.status === "closing" ? "The scores, e.g. 4 3 5 2" : "Say what happened… ('done' to wrap up)"}
              className={`${input} resize-none`}
            />
            <button type="button" className={btn} disabled={busy || !draft.trim()} onClick={() => void send()}>
              {busy ? "…" : "SEND"}
            </button>
          </div>
        )}
        {err && <div className="text-xs text-error">{err}</div>}
        {day.cost_pence > 0 && <Mono className="text-[10px] text-text-2">cost {day.cost_pence.toFixed(1)}p</Mono>}
      </section>
    </div>
  );
}
