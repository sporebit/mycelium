"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_SHORT } from "@/lib/fitness/types";
import type { Slot, TodayResponse } from "@/lib/fitness/types";

type ProgrammeSession = TodayResponse["programme_sessions"][number];

type Props = {
  slot: Slot;
  currentProgrammeSessionId: string | null;
  sessionId: string | null; // null if no workout_sessions row exists
  hasLoggedWork: boolean;
  todayDayOfWeek: number;
  programmeSessions: ProgrammeSession[];
  /** Called after a successful swap so the parent can refetch. */
  onSwapped: () => void;
};

const SLOT_SHORT: Record<TemplateSlotLike, string> = {
  morning: "AM",
  afternoon: "PM",
};
type TemplateSlotLike = "morning" | "afternoon";

export function SessionSwapDropdown({
  slot,
  currentProgrammeSessionId,
  sessionId,
  hasLoggedWork,
  todayDayOfWeek,
  programmeSessions,
  onSwapped,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<ProgrammeSession | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const grouped = useMemo(() => {
    const today: ProgrammeSession[] = [];
    const other: ProgrammeSession[] = [];
    for (const s of programmeSessions) {
      if (s.day_of_week === todayDayOfWeek) today.push(s);
      else other.push(s);
    }
    return { today, other };
  }, [programmeSessions, todayDayOfWeek]);

  async function pick(target: ProgrammeSession) {
    if (target.id === currentProgrammeSessionId) {
      setOpen(false);
      return;
    }
    if (sessionId && hasLoggedWork) {
      setConfirmFor(target);
      return;
    }
    await doSwap(target);
  }

  async function doSwap(target: ProgrammeSession) {
    setBusy(true);
    try {
      if (sessionId) {
        const r = await fetch(`/api/fitness/sessions/${sessionId}/swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_programme_session_id: target.id }),
        });
        if (!r.ok) return;
      } else {
        const r = await fetch("/api/fitness/today/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slot,
            target_programme_session_id: target.id,
          }),
        });
        if (!r.ok) return;
      }
      onSwapped();
      setOpen(false);
      setConfirmFor(null);
    } finally {
      setBusy(false);
    }
  }

  function label(s: ProgrammeSession): string {
    const day = DAY_SHORT[s.day_of_week] ?? "?";
    const slotShort = SLOT_SHORT[s.slot as TemplateSlotLike] ?? s.slot;
    return `${day} ${slotShort} · ${s.name}`;
  }

  return (
    <>
      <div className="relative inline-block" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink-4 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
          aria-label="Change session"
        >
          SWAP <span aria-hidden>▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-7 z-40 w-72 max-h-80 overflow-y-auto bg-ink-1 border border-ink-2 rounded-md shadow-2xl py-2">
            {grouped.today.length > 0 && (
              <Group title="Today's planned">
                {grouped.today.map((s) => (
                  <Item
                    key={s.id}
                    label={label(s)}
                    current={s.id === currentProgrammeSessionId}
                    onClick={() => void pick(s)}
                  />
                ))}
              </Group>
            )}
            <Group title="Other days">
              {grouped.other.map((s) => (
                <Item
                  key={s.id}
                  label={label(s)}
                  current={s.id === currentProgrammeSessionId}
                  onClick={() => void pick(s)}
                />
              ))}
            </Group>
          </div>
        )}
      </div>

      {confirmFor && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setConfirmFor(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-ink-2">
              <h2 className="text-base text-ink-4">Swap session?</h2>
            </div>
            <div className="px-5 py-4 text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
              Swap to <span className="text-ink-4">{confirmFor.name}</span>?
              <br />
              Your logged sets will be kept; empty planned exercises will be
              replaced with the new session&apos;s exercises.
            </div>
            <div className="px-5 py-4 border-t border-ink-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmFor(null)}
                className="flex-1 h-11 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doSwap(confirmFor)}
                className="flex-[2] h-11 rounded-md bg-accent/20 border border-accent/50 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
              >
                {busy ? "SWAPPING…" : "SWAP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-1">
      <div className="px-3 pt-1 pb-1 text-[9px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)]">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Item({
  label,
  current,
  onClick,
}: {
  label: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-2 text-xs font-[family-name:var(--font-mono)] tracking-[0.08em] rounded-sm flex items-center gap-2 hover:bg-ink-2/30 ${
        current ? "text-accent" : "text-ink-4"
      }`}
    >
      <span className="w-3 shrink-0">{current ? "▸" : ""}</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
