"use client";

import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type { EnrichedSource, SearchMatch } from "@/lib/memory/types";

function relativeDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.floor(d)}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function typeBadge(source: EnrichedSource | null): {
  label: string;
  className: string;
} {
  if (!source) return { label: "NOTE", className: "bg-ink-2 text-ink-3 border-ink-2" };
  if (source.type === "task")
    return {
      label: "TASK",
      className: "bg-accent/15 text-accent border-accent/40",
    };
  if (source.type === "capture")
    return {
      label: "CAPTURE",
      className: "bg-warn/15 text-warn border-warn/40",
    };
  return {
    label: source.source_type.toUpperCase(),
    className: "bg-ink-2 text-ink-3 border-ink-2",
  };
}

function bodyText(match: SearchMatch): string {
  if (match.source?.type === "task") {
    const parts = [match.source.title];
    if (match.source.description) parts.push(match.source.description);
    return parts.join(" — ");
  }
  if (match.source?.type === "capture" && match.source.raw_text) {
    return match.source.raw_text;
  }
  return match.chunk.text ?? "";
}

function openHref(source: EnrichedSource | null): string | null {
  if (source?.type === "task") return `/crm/tasks?focus=${source.id}`;
  return null;
}

export function SourceCard({
  match,
  citationTag,
  id,
  highlighted = false,
}: {
  match: SearchMatch;
  citationTag?: string;
  id?: string;
  highlighted?: boolean;
}) {
  const badge = typeBadge(match.source);
  const body = bodyText(match);
  const href = openHref(match.source);
  const pct = Math.round(match.chunk.similarity * 100);

  return (
    <article
      id={id}
      className={`rounded-lg border p-3 transition-colors ${
        highlighted
          ? "border-accent/60 bg-accent/5"
          : "border-ink-2 bg-ink-0/40"
      }`}
    >
      <header className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {citationTag && (
            <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/15 text-accent">
              {citationTag}
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${badge.className}`}
          >
            {badge.label}
          </span>
          <Mono className="text-[10px] text-ink-3">
            {relativeDays(match.chunk.created_at)}
          </Mono>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Mono className="text-[10px] text-ink-3">{pct}%</Mono>
          {href && (
            <Link
              href={href}
              className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
            >
              → open
            </Link>
          )}
        </div>
      </header>
      <p className="text-sm text-ink-4 leading-snug whitespace-pre-wrap break-words">
        {body}
      </p>
      {match.source?.type === "task" && match.source.entity_name && (
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {match.source.entity_name}
        </div>
      )}
    </article>
  );
}
