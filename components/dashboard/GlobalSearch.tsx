"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SearchMatch } from "@/lib/memory/types";
import { SourceCard } from "@/components/stroma/SourceCard";
import { SECTIONS } from "@/lib/nav/sections";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function closeModal() {
    setOpen(false);
    setQuery("");
    setMatches(null);
    setError(null);
    setLoading(false);
  }

  // Cmd/Ctrl+K to toggle, Escape to close. setState calls happen inside the
  // event handler, not directly in the effect body.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when the modal opens. No setState here — just a DOM call.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search. All setState calls happen inside the async IIFE,
  // after the setTimeout fires — i.e. inside callbacks, not the effect body.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch("/api/memory/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 8 }),
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted) return;
          const j = await res.json();
          if (ctrl.signal.aborted) return;
          if (!res.ok) {
            setError(j.error ?? `Search failed (${res.status})`);
            setMatches([]);
          } else {
            setMatches(Array.isArray(j.matches) ? j.matches : []);
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Network error");
          setMatches([]);
        } finally {
          if (!ctrl.signal.aborted) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open]);

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (!v.trim()) {
      // Clear stale results immediately when user empties the input.
      setMatches(null);
      setError(null);
    }
  }

  function openInBrain() {
    const q = query.trim();
    closeModal();
    router.push(q ? `/brain?q=${encodeURIComponent(q)}` : "/brain");
  }

  // Navigation results derived from the sections registry. Empty query
  // shows nothing (memory prompt handles that); non-empty query matches
  // section labels + subpage labels case-insensitively.
  const navResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { label: string; href: string }[];
    const out: { label: string; href: string }[] = [];
    if ("dashboard".includes(q) || "home".includes(q)) {
      out.push({ label: "Dashboard", href: "/" });
    }
    for (const s of SECTIONS) {
      if (s.label.toLowerCase().includes(q)) {
        out.push({ label: s.label, href: s.baseRoute });
      }
      for (const sp of s.subPages) {
        if (sp.label.toLowerCase().includes(q)) {
          out.push({ label: `${s.label} → ${sp.label}`, href: sp.href });
        }
      }
    }
    return out.slice(0, 8);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm"
        onClick={closeModal}
      />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-ink-2 bg-ink-1 shadow-2xl overflow-hidden"
        role="dialog"
        aria-label="Search memory"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openInBrain();
          }}
          className="px-4 py-3 border-b border-ink-2 flex items-center gap-3"
        >
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
            ⌘K
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={onInputChange}
            placeholder="Search your memory…"
            className="flex-1 bg-transparent outline-none text-base text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)]"
          />
          {loading && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              …
            </span>
          )}
        </form>

        <div className="max-h-[55vh] overflow-y-auto p-3">
          {navResults.length > 0 && (
            <div className="mb-3">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-text-lo font-[family-name:var(--font-mono)]">
                Navigate
              </div>
              <ul className="flex flex-col">
                {navResults.map((r) => (
                  <li key={r.href}>
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        router.push(r.href);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-v2-sm text-sm text-text-mid hover:bg-surface-2 hover:text-text-hi transition-colors"
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error ? (
            <div className="text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)] px-1 py-2">
              ⚠ {error}
            </div>
          ) : !query.trim() ? (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] px-1 py-3">
              Type to search across all captures, tasks, and notes.
            </div>
          ) : matches === null ? null : matches.length === 0 ? (
            navResults.length === 0 ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] px-1 py-3">
                No matches.
              </div>
            ) : null
          ) : (
            <ul className="flex flex-col gap-2">
              {matches.map((m) => (
                <li key={m.chunk.id}>
                  <SourceCard match={m} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="px-4 py-2 border-t border-ink-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          <span>Esc to close · Enter to open in Brain</span>
          <Link
            href={query.trim() ? `/brain?q=${encodeURIComponent(query.trim())}` : "/brain"}
            onClick={closeModal}
            className="hover:text-ink-4 transition-colors"
          >
            Open in Brain →
          </Link>
        </footer>
      </div>
    </div>
  );
}
