"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { JournalEntry } from "@/lib/journal/types";
import type { CardWidth } from "@/lib/dashboard/card-registry";

const MOOD_TONE: Record<string, string> = {
  energised: "bg-ok/15 text-ok border-ok/40",
  calm: "bg-ok/10 text-ok border-ok/30",
  reflective: "bg-accent/15 text-accent border-accent/40",
  grateful: "bg-accent/10 text-accent border-accent/30",
  tired: "bg-ink-2 text-ink-3 border-ink-2",
  anxious: "bg-warn/15 text-warn border-warn/40",
  frustrated: "bg-danger/15 text-danger border-danger/40",
  neutral: "bg-ink-2 text-ink-3 border-ink-2",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function Journal({ width = 1 }: { width?: CardWidth } = {}) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/journal/today", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as { entries?: JournalEntry[] };
        if (!mounted) return;
        setEntries(Array.isArray(j.entries) ? j.entries : []);
      } catch {
        if (mounted) setEntries([]);
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = entries?.length ?? 0;

  return (
    <Panel
      borderless
      title="JOURNAL"
      topRight={<Mono>TODAY</Mono>}
      bottomCTA={
        <Link href="/journal" className="hover:text-ink-4 transition-colors">
          {count > 0 ? `${count} ${count === 1 ? "entry" : "entries"} · ` : ""}
          VIEW ALL →
        </Link>
      }
    >
      {entries === null ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 leading-relaxed">
          No journal entries yet today. Capture one via Telegram or the
          capture box.
        </div>
      ) : (
        <ul
          className={
            width >= 3
              ? "grid grid-cols-2 gap-x-6"
              : "flex flex-col divide-y divide-ink-2"
          }
        >
          {entries.map((e) => {
            const isOpen = expanded.has(e.id);
            const moodCls =
              e.mood && MOOD_TONE[e.mood]
                ? MOOD_TONE[e.mood]
                : "bg-ink-2 text-ink-3 border-ink-2";
            return (
              <li
                key={e.id}
                className={width >= 3 ? "border-b border-ink-2 last:border-b-0" : ""}
              >
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  className={`w-full text-left py-2.5 ${
                    width >= 3 ? "" : "first:pt-0"
                  } flex items-start gap-3 hover:bg-ink-2/30 transition-colors px-1 -mx-1 rounded-md`}
                >
                  <Mono className="text-[11px] text-ink-3 w-12 shrink-0 pt-0.5">
                    {fmtTime(e.created_at)}
                  </Mono>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-4 leading-snug">
                      {e.summary ?? e.raw_text.slice(0, 60)}
                    </div>
                    {e.mood && (
                      <span
                        className={`mt-1 inline-block text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${moodCls}`}
                      >
                        {e.mood}
                      </span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-1 pb-3 pl-[60px]">
                    <p className="text-sm text-ink-4 leading-relaxed whitespace-pre-wrap">
                      {e.raw_text}
                    </p>
                    {e.tags && e.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 text-ink-3"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
