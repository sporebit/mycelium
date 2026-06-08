"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel } from "@/components/dashboard/Panel";
import { SearchResults } from "./SearchResults";
import { AskAnswer } from "./AskAnswer";
import type { AskSource, SearchMatch } from "@/lib/memory/types";

type Mode = "search" | "ask";


async function streamAsk(
  question: string,
  handlers: {
    onSources: (sources: AskSource[]) => void;
    onToken: (token: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
  signal: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError(err instanceof Error ? err.message : "Network error");
    return;
  }
  if (!res.ok || !res.body) {
    handlers.onError(`Ask failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const lines = event.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            sources?: AskSource[];
            message?: string;
          };
          if (data.type === "sources" && data.sources) {
            handlers.onSources(data.sources);
          } else if (data.type === "token" && typeof data.content === "string") {
            handlers.onToken(data.content);
          } else if (data.type === "done") {
            handlers.onDone();
          } else if (data.type === "error") {
            handlers.onError(data.message ?? "stream error");
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}

export function StromaClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [mode, setMode] = useState<Mode>("ask");
  const [query, setQuery] = useState(initialQuery);
  const [submitting, setSubmitting] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);

  // Search state
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [journalOnly, setJournalOnly] = useState(false);

  // Ask state
  const [askAnswer, setAskAnswer] = useState("");
  const [askSources, setAskSources] = useState<AskSource[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/memory/stats")
      .then((r) => r.json())
      .then((j: { count?: number }) => {
        if (typeof j?.count === "number") setMemoryCount(j.count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      askAbortRef.current?.abort();
    };
  }, []);

  async function runSearch(q: string) {
    setSearchError(null);
    setMatches(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          ...(journalOnly ? { source_type: "journal" } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSearchError(j.error ?? `Search failed (${res.status})`);
        setMatches([]);
        return;
      }
      setMatches(Array.isArray(j.matches) ? j.matches : []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Network error");
      setMatches([]);
    } finally {
      setSubmitting(false);
    }
  }

  async function runAsk(q: string) {
    askAbortRef.current?.abort();
    const ctrl = new AbortController();
    askAbortRef.current = ctrl;

    setAskError(null);
    setAskAnswer("");
    setAskSources([]);
    setSubmitting(true);

    await streamAsk(
      q,
      {
        onSources: (s) => setAskSources(s),
        onToken: (t) => setAskAnswer((cur) => cur + t),
        onDone: () => setSubmitting(false),
        onError: (m) => {
          setAskError(m);
          setSubmitting(false);
        },
      },
      ctrl.signal
    );
  }

  function submit(qOverride?: string) {
    const q = (qOverride ?? query).trim();
    if (!q || submitting) return;
    setQuery(q);
    if (mode === "search") void runSearch(q);
    else void runAsk(q);
  }

  const noMemory = memoryCount === 0;
  const hasResults =
    (mode === "search" && matches !== null) ||
    (mode === "ask" && (askAnswer !== "" || askSources.length > 0 || submitting));

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* Mode tabs */}
      <div className="flex items-center justify-center gap-1">
        {(["search", "ask"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
              mode === m
                ? "bg-ink-2 text-ink-4"
                : "text-ink-3 hover:text-ink-4"
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-md bg-ink-1 px-6 py-5 flex items-center gap-3 focus-within:outline focus-within:outline-1 focus-within:outline-glow-2"
      >
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "ask"
              ? "Ask your OS anything…"
              : "Search captures, journals, decisions…"
          }
          disabled={submitting}
          className="flex-1 bg-transparent outline-none text-xl text-text-0 placeholder:text-text-3 italic font-[family-name:var(--font-display)]"
        />
        <button
          type="submit"
          disabled={!query.trim() || submitting}
          className="px-3 py-1.5 rounded-md bg-glow-2/30 border border-glow-2/60 text-text-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-glow-2/50 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {submitting
            ? "…"
            : mode === "ask"
              ? "ASK →"
              : "SEARCH →"}
        </button>
      </form>

      {/* Filter chips — search mode only for now */}
      {mode === "search" && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setJournalOnly((v) => !v)}
            className={`px-3 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors ${
              journalOnly
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 bg-ink-0/40 text-ink-3 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            Journal only
          </button>
        </div>
      )}

      {/* Empty memory state */}
      {noMemory && (
        <Panel title="Empty memory">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Start capturing to build your memory. Every Telegram message, web
            capture, and task you create gets embedded and becomes searchable
            here.
          </p>
        </Panel>
      )}


      {/* Results */}
      {mode === "search" ? (
        <SearchResults
          loading={submitting}
          matches={matches}
          error={searchError}
        />
      ) : (
        <AskAnswer
          streaming={submitting}
          answer={askAnswer}
          sources={askSources}
          error={askError}
          highlightedSource={null}
        />
      )}
    </div>
  );
}
