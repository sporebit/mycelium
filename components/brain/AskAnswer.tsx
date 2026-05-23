"use client";

import { useState, type ReactNode } from "react";
import type { AskSource } from "@/lib/memory/types";
import { SourceCard } from "./SourceCard";
import { Mono } from "@/components/dashboard/Mono";

function sourceElementId(n: number): string {
  return `ask-source-${n}`;
}

function scrollToSource(n: number, expandSources: () => void) {
  expandSources();
  // After expansion, scroll into view (next frame so DOM is updated)
  requestAnimationFrame(() => {
    const el = document.getElementById(sourceElementId(n));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderAnswer(
  text: string,
  sources: AskSource[],
  onCite: (n: number) => void
): ReactNode[] {
  const out: ReactNode[] = [];
  const regex = /\[C(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(
        <span key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }
    const n = parseInt(match[1], 10);
    const valid = n >= 1 && n <= sources.length;
    out.push(
      <button
        key={`c-${key++}`}
        type="button"
        onClick={() => valid && onCite(n)}
        disabled={!valid}
        className={`mx-0.5 inline-flex items-center text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] px-1.5 py-0.5 rounded-md border align-baseline ${
          valid
            ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
            : "border-ink-2 bg-ink-2 text-ink-3 opacity-50 cursor-not-allowed"
        }`}
        title={
          valid
            ? `Jump to source ${n}`
            : `Citation [C${n}] doesn't match any source`
        }
      >
        C{n}
      </button>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return out;
}

export function AskAnswer({
  streaming,
  answer,
  sources,
  error,
  highlightedSource,
}: {
  streaming: boolean;
  answer: string;
  sources: AskSource[];
  error: string | null;
  highlightedSource: number | null;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(highlightedSource);

  if (error) {
    return (
      <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!streaming && answer === "" && sources.length === 0) {
    return null;
  }
  if (streaming && answer === "") {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
        <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
        Thinking…
      </div>
    );
  }

  function onCite(n: number) {
    setHighlight(n);
    scrollToSource(n, () => setSourcesOpen(true));
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <article className="text-base text-ink-4 leading-relaxed whitespace-pre-wrap">
        {renderAnswer(answer, sources, onCite)}
        {streaming && (
          <span
            aria-hidden
            className="inline-block w-1.5 h-4 bg-accent ml-0.5 align-text-bottom animate-pulse"
          />
        )}
      </article>

      {sources.length > 0 && (
        <section className="rounded-lg border border-ink-2 bg-ink-0/30">
          <button
            type="button"
            onClick={() => setSourcesOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            <span>Sources <Mono className="text-ink-3">({sources.length})</Mono></span>
            <span aria-hidden>{sourcesOpen ? "▼" : "▶"}</span>
          </button>
          {sourcesOpen && (
            <ul className="flex flex-col gap-2 p-3 pt-0">
              {sources.map((s, i) => (
                <li key={s.chunk.id}>
                  <SourceCard
                    match={s}
                    citationTag={s.citation_tag}
                    id={sourceElementId(i + 1)}
                    highlighted={highlight === i + 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
