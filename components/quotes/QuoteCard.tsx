"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type { QuoteRow } from "@/lib/quotes/server";
import type { ResearchPayload } from "@/lib/quotes/research";

export function quotePersonName(q: QuoteRow): string | null {
  const p = Array.isArray(q.person) ? (q.person[0] ?? null) : q.person;
  if (!p) return null;
  return p.display_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ") ?? null;
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const BADGE: Record<QuoteRow["research_status"], { label: string; cls: string }> = {
  pending: { label: "researching", cls: "border-ink-4 text-text-2" },
  running: { label: "researching", cls: "border-ink-4 text-text-2" },
  found: { label: "known", cls: "border-glow-2/50 text-glow-1 bg-glow-3/40" },
  none: { label: "original", cls: "border-ok/40 text-ok bg-ok/10" },
  skipped: { label: "skipped", cls: "border-ink-4 text-text-2" },
  failed: { label: "failed", cls: "border-error/50 text-error" },
  wrong: { label: "wrong", cls: "border-warn/50 text-warn" },
};

const CONF: Record<string, string> = { high: "text-ok", medium: "text-warn", low: "text-text-2" };

export function ResearchBadge({ q, onClick, open }: { q: QuoteRow; onClick?: () => void; open?: boolean }) {
  const b = BADGE[q.research_status] ?? BADGE.pending;
  const conf = (q.research as Partial<ResearchPayload> | null)?.confidence;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Research"
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${b.cls} ${open ? "ring-1 ring-glow-2" : ""}`}
    >
      {b.label}
      {q.research_status === "found" && conf ? <span className={CONF[conf] ?? ""}>· {conf}</span> : null}
    </button>
  );
}

/** The §3.1 payload, inline. */
export function ResearchPanel({ q }: { q: QuoteRow }) {
  const r = (q.research ?? null) as Partial<ResearchPayload> | null;
  if (!r || (!r.verdict && !r.error)) {
    return <div className="text-xs text-ink-3 italic">{q.research_status === "skipped" ? "Skipped — sounded like their own words. Re-run to check anyway." : "No research yet."}</div>;
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs text-text-1">
      {r.error && <div className="text-error">Error: {r.error}</div>}
      {r.verdict && (
        <div>
          <span className="text-text-2">Verdict</span> {r.verdict}
          {r.confidence ? <span className={`ml-2 ${CONF[r.confidence] ?? ""}`}>({r.confidence} confidence)</span> : null}
        </div>
      )}
      {r.original_author && (
        <div>
          <span className="text-text-2">Author</span> {r.original_author}
          {r.source_work ? <span className="text-text-2"> · {r.source_work}</span> : null}
          {r.year ? <span className="text-text-2"> · {r.year}</span> : null}
        </div>
      )}
      {r.context && <div className="text-text-1">{r.context}</div>}
      {r.wording_note && <div className="text-text-2 italic">{r.wording_note}</div>}
      {Array.isArray(r.sources) && r.sources.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {r.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="text-glow-2 hover:underline break-all">
                {s.title || s.url}
              </a>
            </li>
          ))}
        </ul>
      )}
      {r.model && (
        <Mono className="text-[10px] text-ink-3">
          {r.model} · {fmtDay(r.searched_at ?? q.research_ran_at)}
        </Mono>
      )}
    </div>
  );
}

export function QuoteCard({
  q,
  onOpen,
  onToggleMerch,
  showPerson = true,
}: {
  q: QuoteRow;
  onOpen?: (q: QuoteRow) => void;
  onToggleMerch?: (q: QuoteRow) => void;
  showPerson?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const who = q.is_own ? "Me" : quotePersonName(q);
  const said = fmtDay(q.said_at);
  const added = fmtDay(q.created_at);
  return (
    <article className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
      <button type="button" onClick={() => onOpen?.(q)} className="text-left">
        <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-text-0">“{q.text}”</p>
      </button>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showPerson &&
          (q.is_own ? (
            <span className="rounded-full bg-ink-2 px-2 py-0.5 text-text-1">Me</span>
          ) : q.said_by_person_id ? (
            <Link href={`/organisation/people/${q.said_by_person_id}`} className="rounded-full bg-ink-2 px-2 py-0.5 text-text-1 hover:text-text-0">
              {who ?? "person"}
            </Link>
          ) : (
            <span className="rounded-full bg-ink-2 px-2 py-0.5 text-text-2 italic">unknown speaker</span>
          ))}
        {q.speaker_confidence === "uncertain" && <span className="text-warn">speaker uncertain</span>}
        {q.attributed_to && q.research_status === "found" && <span className="text-text-2">orig. {q.attributed_to}</span>}
        <Mono className="text-[10px] text-text-2">
          added {added}
          {said && said !== added ? ` · said ${said}` : ""}
        </Mono>
        <span className="flex-1" />
        <ResearchBadge q={q} open={open} onClick={() => setOpen((v) => !v)} />
        <button
          type="button"
          onClick={() => onToggleMerch?.(q)}
          title="Merch"
          className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${q.merch ? "border-accent/60 text-accent bg-accent/10" : "border-ink-4 text-text-2 hover:text-text-0"}`}
        >
          {q.merch ? "✓ merch" : "merch"}
        </button>
      </div>
      {q.context && <div className="text-xs text-text-2">{q.context}</div>}
      {open && (
        <div className="rounded-sm border border-ink-2 bg-ink-0/40 px-3 py-2">
          <ResearchPanel q={q} />
        </div>
      )}
    </article>
  );
}
