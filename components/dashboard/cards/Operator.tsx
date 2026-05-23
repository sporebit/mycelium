"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { OPERATOR } from "@/lib/config/operator";

export function Operator() {
  const [focus, setFocus] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/daily-log/today")
      .then((r) => r.json())
      .then((j: { notes?: { focus?: string } }) => {
        if (!mounted) return;
        setFocus(typeof j?.notes?.focus === "string" ? j.notes.focus : "");
        setLoaded(true);
      })
      .catch(() => mounted && setLoaded(true));
    fetch("/api/streak")
      .then((r) => r.json())
      .then((j: { days?: number }) => {
        if (mounted && typeof j?.days === "number") setStreak(j.days);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  function beginEdit() {
    setDraft(focus);
    setEditing(true);
    queueMicrotask(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(focus.length, focus.length);
    });
  }

  async function save() {
    if (saving) return;
    if (draft === focus) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/daily-log/today", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: draft }),
      });
      if (res.ok) {
        setFocus(draft);
        setEditing(false);
      }
    } catch {
      /* swallow */
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(focus);
      setEditing(false);
    }
  }

  const fullName = [OPERATOR.firstName, OPERATOR.lastName].filter(Boolean).join(" ");
  const initial = OPERATOR.firstName.charAt(0).toUpperCase() || "?";
  const streakLabel =
    streak === null ? "—" : `${streak} ${streak === 1 ? "DAY" : "DAYS"}`;

  return (
    <Panel number="01" title="OPERATOR" status="ONLINE" statusTone="ok">
      <div className="flex flex-col items-center gap-3 pt-1">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-ink-2 to-ink-1 border border-ink-2 flex items-center justify-center">
          <span className="text-2xl font-[family-name:var(--font-display)] italic text-ink-4">
            {initial}
          </span>
        </div>
        <div className="text-center">
          <div className="text-base text-ink-4">{fullName}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            {OPERATOR.role} · {OPERATOR.city}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-ink-2 flex flex-col gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
            Focus
          </div>
          {editing ? (
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={save}
              placeholder="What are you focused on?"
              rows={2}
              className="w-full bg-transparent text-sm text-ink-4 italic font-[family-name:var(--font-display)] outline-none resize-none placeholder:text-ink-3 leading-snug"
              disabled={saving}
            />
          ) : (
            <button
              type="button"
              onClick={beginEdit}
              className="text-left w-full text-sm text-ink-4 italic font-[family-name:var(--font-display)] hover:text-ink-3 transition-colors whitespace-pre-wrap leading-snug"
              title="Click to edit"
            >
              {loaded && focus ? (
                focus
              ) : (
                <span className="text-ink-3">[Set today&apos;s focus]</span>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Streak
          </span>
          <Mono className="text-sm text-ink-4">{streakLabel}</Mono>
        </div>
      </div>
    </Panel>
  );
}
