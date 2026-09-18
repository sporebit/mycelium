"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Mono } from "@/components/dashboard/Mono";
import { ticketFetch } from "@/components/tickets/pickers";
import type { QuoteRow } from "@/lib/quotes/server";
import { ResearchBadge, ResearchPanel } from "./QuoteCard";

export type PersonOption = { id: string; name: string };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const input =
  "w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn =
  "px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

function fromQuote(q: QuoteRow) {
  return {
    text: q.text,
    context: q.context ?? "",
    source: q.source ?? "",
    said_at: toLocalInput(q.said_at),
    said_by_person_id: q.said_by_person_id ?? "",
    is_own: q.is_own,
    attributed_to: q.attributed_to ?? "",
  };
}

/** Detail: every PATCH field, the raw transcript read-only, and the research panel with Re-run / Wrong / Their own. */
export function QuoteSheet({
  quote,
  people,
  onClose,
  onChanged,
  onDeleted,
}: {
  quote: QuoteRow | null;
  people: PersonOption[];
  onClose: () => void;
  onChanged: (q: QuoteRow) => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <Sheet open={!!quote} onClose={onClose} title="Quote">
      {quote && (
        <QuoteSheetBody
          key={quote.id}
          quote={quote}
          people={people}
          onClose={onClose}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  );
}

/** Keyed by quote id so the draft resets when a different quote opens (no effect needed). */
function QuoteSheetBody({
  quote,
  people,
  onClose,
  onChanged,
  onDeleted,
}: {
  quote: QuoteRow;
  people: PersonOption[];
  onClose: () => void;
  onChanged: (q: QuoteRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState(() => fromQuote(quote));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ quote?: QuoteRow } | unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = (await fn()) as { quote?: QuoteRow };
      if (r?.quote) {
        onChanged(r.quote);
        // research can set attributed_to; keep the field in step with the row
        const next = r.quote.attributed_to ?? "";
        setDraft((d) =>
          d.attributed_to === next ? d : { ...d, attributed_to: next },
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(() =>
      ticketFetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        body: {
          text: draft.text,
          context: draft.context || null,
          source: draft.source || null,
          said_at: draft.said_at
            ? new Date(draft.said_at).toISOString()
            : quote.said_at,
          is_own: draft.is_own,
          said_by_person_id: draft.is_own
            ? null
            : draft.said_by_person_id || null,
          attributed_to: draft.attributed_to || null,
        },
      }),
    );

  const del = async () => {
    if (!window.confirm("Delete this quote?")) return;
    setBusy(true);
    try {
      await ticketFetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
      onDeleted(quote.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Text</span>
        <textarea
          rows={3}
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          className={`${input} resize-y font-[family-name:var(--font-display)] text-lg`}
        />
      </label>
      {quote.raw_text && (
        <div>
          <div className="card-eyebrow mb-1">As captured</div>
          <div className="rounded-sm border border-ink-2 bg-ink-0/40 px-3 py-2 text-xs text-text-2 whitespace-pre-wrap">
            {quote.raw_text}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Said by</span>
          <select
            value={draft.is_own ? "__me" : draft.said_by_person_id}
            onChange={(e) => {
              const v = e.target.value;
              setDraft({
                ...draft,
                is_own: v === "__me",
                said_by_person_id: v === "__me" ? "" : v,
              });
            }}
            className={input}
          >
            <option value="">— unknown —</option>
            <option value="__me">Me</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Said at</span>
          <input
            type="datetime-local"
            value={draft.said_at}
            onChange={(e) => setDraft({ ...draft, said_at: e.target.value })}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Context</span>
          <input
            value={draft.context}
            onChange={(e) => setDraft({ ...draft, context: e.target.value })}
            placeholder="at the pub, on the walk…"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Source (if quoting something)</span>
          <input
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            placeholder="film, book, person"
            className={input}
          />
        </label>
      </div>
      {quote.speaker_confidence === "uncertain" && (
        <div className="text-xs text-warn">
          The speaker was inferred, not stated. Saving with a person or Me marks
          it certain.
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => void save()}
          disabled={busy || !draft.text.trim()}
        >
          SAVE
        </button>
        <button
          type="button"
          className={btn}
          onClick={() =>
            run(() =>
              ticketFetch(`/api/quotes/${quote.id}`, {
                method: "PATCH",
                body: { merch: !quote.merch },
              }),
            )
          }
          disabled={busy}
        >
          {quote.merch ? "✓ MERCH" : "MERCH"}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className={`${btn} hover:border-error/60 hover:text-error`}
          onClick={() => void del()}
          disabled={busy}
        >
          DELETE
        </button>
      </div>
      {err && <div className="text-xs text-error">{err}</div>}

      <div className="rounded-md border border-ink-2 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="card-eyebrow">Research</span>
          <ResearchBadge q={quote} />
        </div>
        <ResearchPanel q={quote} />
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Attributed to</span>
          <input
            value={draft.attributed_to}
            onChange={(e) =>
              setDraft({ ...draft, attributed_to: e.target.value })
            }
            placeholder="original author, if any"
            className={input}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn}
            disabled={busy || quote.research_status === "running"}
            onClick={() =>
              run(() =>
                ticketFetch(`/api/quotes/${quote.id}/research`, {
                  method: "POST",
                }),
              )
            }
          >
            {busy ? "…" : "RE-RUN"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() =>
              run(() =>
                ticketFetch(`/api/quotes/${quote.id}/research`, {
                  method: "PATCH",
                  body: { action: "wrong" },
                }),
              )
            }
          >
            WRONG
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() =>
              run(() =>
                ticketFetch(`/api/quotes/${quote.id}/research`, {
                  method: "PATCH",
                  body: { action: "own" },
                }),
              )
            }
          >
            THEIR OWN
          </button>
          <Mono className="text-[10px] text-ink-3 ml-auto">
            {quote.research_status}
          </Mono>
        </div>
      </div>
    </div>
  );
}
