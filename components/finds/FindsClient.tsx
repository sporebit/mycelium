"use client";

/**
 * The week's finds (master run §12): everything the watchers and the share
 * sheet brought in, grouped by day, each with its verdict and a Keep /
 * Skip; the sources it came from, switchable, with feeds added in place;
 * and the week as a Markdown record in the resources format.
 */
import { useState } from "react";
import { Button, Label, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { type FindRow, SOURCE_LABEL, type SourceRow, VERDICT_LABEL, type VerdictCall } from "@/lib/finds/types";

type FindsView = { days: number; finds: FindRow[] };
type SourcesView = { sources: SourceRow[] };

const dayOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
const BADGE: Record<VerdictCall, string> = { use_now: "border-glow text-glow", maybe_later: "border-hairline text-text-mid", skip: "border-hairline text-text-lo" };

function Find({ row, busy, onAnswer }: { row: FindRow; busy: boolean; onAnswer: (a: "keep" | "skip" | null) => void }) {
  const v = row.verdict;
  const choice = (a: "keep" | "skip", label: string) => (
    <button
      type="button"
      aria-pressed={row.answer === a}
      disabled={busy}
      onClick={() => onAnswer(row.answer === a ? null : a)}
      className={`min-h-[32px] rounded-v2-md border px-2.5 text-xs ${row.answer === a ? "border-glow text-glow" : "border-hairline text-text-mid hover:text-text-hi"}`}
    >
      {label}
    </button>
  );
  return (
    <li className={`flex flex-col gap-1.5 py-3 ${row.answer === "skip" ? "opacity-60" : ""}`} data-testid="find-row" data-find-id={row.id}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <a href={row.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 text-sm text-text-hi underline-offset-2 hover:underline" style={{ textWrap: "balance" }}>
          {row.title}
        </a>
        {v ? (
          <span className={`rounded-v2-md border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${BADGE[v.verdict]}`} data-testid="find-verdict">
            {VERDICT_LABEL[v.verdict]}
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-[0.08em] text-text-lo">no verdict yet</span>
        )}
        <div className="flex gap-1" role="group" aria-label="Keep or skip">
          {choice("keep", "Keep")}
          {choice("skip", "Skip")}
        </div>
      </div>
      <p className="text-xs text-text-lo">
        {row.kind} · {SOURCE_LABEL[row.source]}
        {row.source_ref ? ` (${row.source_ref})` : ""} · {row.url.replace(/^https:\/\//, "").slice(0, 70)}
      </p>
      {v ? (
        <details className="text-xs text-text-mid">
          <summary className="cursor-pointer text-text-mid">{v.summary}</summary>
          <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-lo">What</dt>
            <dd>{v.what}</dd>
            <dt className="text-text-lo">Cost</dt>
            <dd>{v.cost}</dd>
            <dt className="text-text-lo">Licence</dt>
            <dd>{v.licence}</dd>
            <dt className="text-text-lo">Cautions</dt>
            <dd>{v.cautions}</dd>
            <dt className="text-text-lo">Suits</dt>
            <dd>{v.suits.join(", ")}</dd>
            <dt className="text-text-lo">Judged by</dt>
            <dd>{row.verdict_by === "pc" ? "the PC's own model" : "the cloud model"}</dd>
          </dl>
        </details>
      ) : null}
    </li>
  );
}

function Sources() {
  const { data, error, mutate } = useApi<SourcesView>("/api/finds/sources", { revalidateOnFocus: false });
  const [url, setUrl] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "That did not save.");
      }
      await mutate();
      return true;
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-text-mid">Sources could not be loaded.</p>;
  if (!data) return <p className="text-sm text-text-lo">Loading…</p>;
  return (
    <section aria-label="Sources" className="flex flex-col gap-2" data-testid="finds-sources">
      <Label>Sources</Label>
      <p className="text-xs text-text-lo">Free APIs and feeds, read once a day. The PC runs npm audit in its checkout. The newsletter inbox waits for its mailbox details (MYC-201).</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {data.sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="find-source" data-kind={s.kind}>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-text-hi">
              <input type="checkbox" checked={s.enabled} disabled={busy || s.kind === "imap"} onChange={(e) => void call("PUT", "/api/finds/sources", { id: s.id, enabled: e.target.checked })} aria-label={`${s.label} on`} />
              <span className="truncate">{s.label}</span>
            </label>
            <span className="text-xs text-text-lo">
              {s.last_run_at ? `read ${dayOf(s.last_run_at)}` : "not read yet"}
              {s.last_result && typeof s.last_result.found === "number" ? ` · ${s.last_result.found} seen` : ""}
            </span>
            {s.kind === "rss" ? (
              <button type="button" disabled={busy} onClick={() => void call("DELETE", `/api/finds/sources?id=${s.id}`)} className="text-xs text-text-lo hover:text-text-hi">
                remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("POST", "/api/finds/sources", { url })) setUrl("");
        }}
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/feed.xml" aria-label="Feed address" className="min-h-[36px] flex-1 rounded-v2-md border border-hairline bg-transparent px-3 text-sm text-text-hi" />
        <Button type="submit" disabled={busy || !url.trim()}>
          Add feed
        </Button>
      </form>
      {note ? (
        <p role="alert" className="text-sm text-v2-error">
          {note}
        </p>
      ) : null}
    </section>
  );
}

export function FindsClient() {
  const [days, setDays] = useState(7);
  const { data, error, mutate } = useApi<FindsView>(`/api/finds?days=${days}`, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const answer = async (row: FindRow, a: "keep" | "skip" | null) => {
    setBusy(row.id);
    setSaveError(null);
    try {
      const res = await fetch(`/api/finds/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: a }) });
      if (!res.ok) throw new Error();
      await mutate();
    } catch {
      setSaveError("That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!link.trim()) return;
    setBusy("add");
    setSaveError(null);
    try {
      const res = await fetch("/api/finds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That did not save.");
      setLink("");
      await mutate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="p-6 text-sm text-text-mid">Finds could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="p-6 text-sm text-text-lo">Loading…</p>;

  const byDay = new Map<string, FindRow[]>();
  for (const f of data.finds) {
    const k = dayKey(f.found_at);
    byDay.set(k, [...(byDay.get(k) ?? []), f]);
  }
  const judged = data.finds.filter((f) => f.verdict).length;
  const useNow = data.finds.filter((f) => f.verdict?.verdict === "use_now").length;
  const kept = data.finds.filter((f) => f.answer === "keep").length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6" data-testid="finds-page">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-text-hi">Finds</h1>
          <p className="text-sm text-text-lo">Repos, posts, skills and tools worth a look, shared in or found by the watchers, each opened and judged by the PC. Nothing is installed.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="How far back" className="min-h-[32px] rounded-v2-md border border-hairline bg-transparent px-2 text-xs text-text-mid">
            <option value={7}>this week</option>
            <option value={14}>two weeks</option>
            <option value={30}>a month</option>
          </select>
          <a href={`/api/finds/export?days=${days}`} className="min-h-[32px] rounded-v2-md border border-hairline px-2.5 text-xs leading-[32px] text-text-mid hover:text-text-hi" data-testid="finds-export">
            Export
          </a>
        </div>
      </header>

      <Surface className="flex flex-col gap-2 p-5">
        <p className="text-3xl text-text-hi tabular-nums" data-testid="finds-count">
          {data.finds.length} <span className="text-sm text-text-mid">{data.finds.length === 1 ? "find" : "finds"}</span>
        </p>
        <p className="text-sm text-text-mid">
          {judged} with a verdict · {useNow} to use now · {kept} kept
        </p>
        <form
          className="mt-1 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link to keep it" aria-label="A link to keep" className="min-h-[36px] flex-1 rounded-v2-md border border-hairline bg-transparent px-3 text-sm text-text-hi" />
          <Button type="submit" disabled={busy === "add" || !link.trim()}>
            Keep it
          </Button>
        </form>
      </Surface>
      {saveError ? (
        <p role="alert" className="text-sm text-v2-error">
          {saveError}
        </p>
      ) : null}

      {data.finds.length === 0 ? <p className="text-sm text-text-mid">Nothing yet. Share a link from your phone, paste one above, or wait for the morning&apos;s watchers.</p> : null}
      {[...byDay.entries()].map(([k, rows]) => (
        <section key={k} aria-label={dayOf(rows[0].found_at)}>
          <Label>{dayOf(rows[0].found_at)}</Label>
          <ul className="mt-1 flex flex-col divide-y divide-hairline">
            {rows.map((r) => (
              <Find key={r.id} row={r} busy={busy === r.id} onAnswer={(a) => void answer(r, a)} />
            ))}
          </ul>
        </section>
      ))}

      <Sources />
    </div>
  );
}
