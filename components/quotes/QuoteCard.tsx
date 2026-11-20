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
  pending: { label: "researching", cls: "border-text-hi text-text-lo" },
  running: { label: "researching", cls: "border-text-hi text-text-lo" },
  found: { label: "known", cls: "border-glow-2/50 text-glow-1 bg-glow-3/40" },
  none: { label: "original", cls: "border-ok/40 text-ok bg-ok/10" },
  skipped: { label: "skipped", cls: "border-text-hi text-text-lo" },
  failed: { label: "failed", cls: "border-error/50 text-error" },
  wrong: { label: "wrong", cls: "border-warn/50 text-warn" },
};

const CONF: Record<string, string> = { high: "text-ok", medium: "text-warn", low: "text-text-lo" };

/** `off`: the server has no AI key, so a pending quote is waiting, not being researched. */
export function ResearchBadge({ q, onClick, open, off }: { q: QuoteRow; onClick?: () => void; open?: boolean; off?: boolean }) {
  const b = off && q.research_status === "pending" ? { label: "research off", cls: "border-text-hi text-text-lo" } : (BADGE[q.research_status] ?? BADGE.pending);
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
export function ResearchPanel({ q, off }: { q: QuoteRow; off?: boolean }) {
  const r = (q.research ?? null) as Partial<ResearchPayload> | null;
  if (!r || (!r.verdict && !r.error)) {
    if (off && q.research_status === "pending") return <div className="text-xs text-text-lo italic">Research is off on this server: no AI key is set. The quote waits and is looked up once one is.</div>;
    return <div className="text-xs text-text-lo italic">{q.research_status === "skipped" ? "Skipped — sounded like their own words. Re-run to check anyway." : "No research yet."}</div>;
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs text-text-mid">
      {r.error && <div className="text-error">Error: {r.error}</div>}
      {r.verdict && (
        <div>
          <span className="text-text-lo">Verdict</span> {r.verdict}
          {r.confidence ? <span className={`ml-2 ${CONF[r.confidence] ?? ""}`}>({r.confidence} confidence)</span> : null}
        </div>
      )}
      {r.original_author && (
        <div>
          <span className="text-text-lo">Author</span> {r.original_author}
          {r.source_work ? <span className="text-text-lo"> · {r.source_work}</span> : null}
          {r.year ? <span className="text-text-lo"> · {r.year}</span> : null}
        </div>
      )}
      {r.context && <div className="text-text-mid">{r.context}</div>}
      {r.wording_note && <div className="text-text-lo italic">{r.wording_note}</div>}
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
        <Mono className="text-[10px] text-text-lo">
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
  researchOff = false,
}: {
  q: QuoteRow;
  onOpen?: (q: QuoteRow) => void;
  onToggleMerch?: (q: QuoteRow) => void;
  showPerson?: boolean;
  researchOff?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const who = q.is_own ? "Me" : quotePersonName(q);
  const said = fmtDay(q.said_at);
  const added = fmtDay(q.created_at);
  return (
    <article className="rounded-md bg-surface-1 p-4 flex flex-col gap-2">
      <button type="button" onClick={() => onOpen?.(q)} className="text-left">
        <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-text-hi">“{q.text}”</p>
      </button>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showPerson &&
          (q.is_own ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text-mid">Me</span>
          ) : q.said_by_person_id ? (
            <Link href={`/organisation/people/${q.said_by_person_id}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-text-mid hover:text-text-hi">
              {who ?? "person"}
            </Link>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text-lo italic">unknown speaker</span>
          ))}
        {q.speaker_confidence === "uncertain" && <span className="text-warn">speaker uncertain</span>}
        {/* research sets this, and so can the sheet by hand; Wrong and Their own clear it, so whatever is here is meant to show */}
        {q.attributed_to && <span className="text-text-lo">orig. {q.attributed_to}</span>}
        <Mono className="text-[10px] text-text-lo">
          added {added}
          {said && said !== added ? ` · said ${said}` : ""}
        </Mono>
        <span className="flex-1" />
        <ResearchBadge q={q} open={open} off={researchOff} onClick={() => setOpen((v) => !v)} />
        <button
          type="button"
          onClick={() => onToggleMerch?.(q)}
          title="Merch"
          className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${q.merch ? "border-accent/60 text-accent bg-accent/10" : "border-text-hi text-text-lo hover:text-text-hi"}`}
        >
          {q.merch ? "✓ merch" : "merch"}
        </button>
      </div>
      {q.context && <div className="text-xs text-text-lo">{q.context}</div>}
      {open && (
        <div className="rounded-sm border border-surface-2 bg-surface-0/40 px-3 py-2">
          <ResearchPanel q={q} off={researchOff} />
        </div>
      )}
    </article>
  );
}
