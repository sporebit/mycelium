"use client";

import { useState } from "react";
import type { Task } from "@/lib/types/task";
import { TaskCard } from "./TaskCard";
import { Mono } from "@/components/dashboard/Mono";

const EXAMPLES = [
  "what's overdue",
  "this week's priorities",
  "items waiting on me",
  "what should I do this morning",
];

export function TaskSmart({
  onCardClick,
  onError,
}: {
  onCardClick: (t: Task) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Task[] | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [fallback, setFallback] = useState(false);

  async function submit(q?: string) {
    const text = (q ?? query).trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setQuery(text);
    try {
      const res = await fetch("/api/tasks/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const j = (await res.json()) as {
        tasks?: Task[];
        explanation?: string;
        fallback?: boolean;
        error?: string;
      };
      if (!res.ok) {
        onError(j.error ?? `Failed (${res.status})`);
        return;
      }
      setResults(Array.isArray(j.tasks) ? j.tasks : []);
      setExplanation(typeof j.explanation === "string" ? j.explanation : "");
      setFallback(!!j.fallback);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Smart search failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-xl border border-ink-2 bg-ink-0/40 px-4 py-3 flex items-center gap-3"
      >
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
          ASK
        </span>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ask anything…"
          className="flex-1 bg-transparent outline-none text-base text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)]"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={!query.trim() || submitting}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {submitting ? "THINKING…" : "ASK →"}
        </button>
      </form>

      {results === null ? (
        <div className="flex flex-col gap-3 mt-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Try
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => submit(ex)}
                className="px-3 py-1.5 rounded-full border border-ink-2 bg-ink-0/40 text-sm text-ink-3 hover:border-ink-3 hover:text-ink-4 transition-colors italic font-[family-name:var(--font-display)]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {explanation && (
            <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              {explanation}
              {fallback && (
                <Mono className="ml-2 text-[10px] text-warn">FALLBACK</Mono>
              )}
            </div>
          )}
          {results.length === 0 ? (
            <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-8">
              No matches
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((t) => (
                <li key={t.id}>
                  <TaskCard task={t} onClick={() => onCardClick(t)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
