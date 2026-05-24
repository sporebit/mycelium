"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import {
  isoWeekString,
  mondayKeyOfIsoWeek,
  sundayKeyOfIsoWeek,
  parseIsoWeek,
} from "@/lib/util/week";
import type { Programme, ProgrammePhase } from "@/lib/fitness/types";

type Toast = { kind: "success" | "error"; text: string } | null;

function fmtWeekRange(weekIso: string): string {
  const parsed = parseIsoWeek(weekIso);
  if (!parsed) return weekIso;
  const monday = mondayKeyOfIsoWeek(parsed.year, parsed.week);
  const sunday = sundayKeyOfIsoWeek(parsed.year, parsed.week);
  return `${monday} → ${sunday}`;
}

export function PhasesView() {
  const [phases, setPhases] = useState<ProgrammePhase[] | null>(null);
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [creating, setCreating] = useState(false);

  const thisWeek = useMemo(() => isoWeekString(new Date()), []);
  const [draftProgramme, setDraftProgramme] = useState<string>("");
  const [draftStart, setDraftStart] = useState<string>(thisWeek);
  const [draftEnd, setDraftEnd] = useState<string>("");

  async function load() {
    const [pRes, prRes] = await Promise.all([
      fetch("/api/fitness/phases", { cache: "no-store" }),
      fetch("/api/fitness/programmes", { cache: "no-store" }),
    ]);
    if (pRes.ok) {
      const j = (await pRes.json()) as { phases?: ProgrammePhase[] };
      setPhases(Array.isArray(j.phases) ? j.phases : []);
    } else setPhases([]);
    if (prRes.ok) {
      const j = (await prRes.json()) as { programmes?: Programme[] };
      const list = Array.isArray(j.programmes) ? j.programmes : [];
      setProgrammes(list);
      if (!draftProgramme && list.length > 0) setDraftProgramme(list[0].id);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [pRes, prRes] = await Promise.all([
        fetch("/api/fitness/phases", { cache: "no-store" }),
        fetch("/api/fitness/programmes", { cache: "no-store" }),
      ]);
      if (!mounted) return;
      if (pRes.ok) {
        const j = (await pRes.json()) as { phases?: ProgrammePhase[] };
        if (mounted) setPhases(Array.isArray(j.phases) ? j.phases : []);
      } else if (mounted) setPhases([]);
      if (prRes.ok) {
        const j = (await prRes.json()) as { programmes?: Programme[] };
        const list = Array.isArray(j.programmes) ? j.programmes : [];
        if (mounted) {
          setProgrammes(list);
          if (list.length > 0) setDraftProgramme((cur) => cur || list[0].id);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const programmeName = (id: string): string => {
    const p = programmes?.find((x) => x.id === id);
    return p?.name ?? id;
  };

  async function createPhase(e: React.FormEvent) {
    e.preventDefault();
    if (!draftProgramme || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/fitness/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme_id: draftProgramme,
          start_week_iso: draftStart,
          end_week_iso: draftEnd.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", text: j.error ?? "Create failed" });
        return;
      }
      setDraftEnd("");
      await load();
      setToast({ kind: "success", text: "Phase scheduled" });
    } finally {
      setCreating(false);
    }
  }

  async function deletePhase(id: string) {
    if (!window.confirm("Remove this phase?")) return;
    const res = await fetch(`/api/fitness/phases/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      setToast({ kind: "error", text: "Delete failed" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
        Phases
      </h1>

      <Panel title="Schedule a phase">
        {programmes && programmes.length === 0 ? (
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Create a programme first.
          </p>
        ) : (
          <form
            onSubmit={createPhase}
            className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Programme
              </span>
              <select
                value={draftProgramme}
                onChange={(e) => setDraftProgramme(e.target.value)}
                className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
              >
                {(programmes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Start (YYYY-Www)
              </span>
              <input
                type="text"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                placeholder={thisWeek}
                className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                End (optional)
              </span>
              <input
                type="text"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                placeholder="ongoing"
                className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)]"
              />
            </label>
            <button
              type="submit"
              disabled={!draftProgramme || creating}
              className="h-[34px] px-3 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
            >
              {creating ? "SAVING…" : "+ SCHEDULE"}
            </button>
          </form>
        )}
      </Panel>

      <Panel title="All phases" topRight={<Mono>{phases?.length ?? 0}</Mono>}>
        {phases === null ? (
          <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
            Loading…
          </div>
        ) : phases.length === 0 ? (
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No phases scheduled yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-2">
            {phases.map((p) => {
              const active =
                p.start_week_iso <= thisWeek &&
                (p.end_week_iso === null || p.end_week_iso >= thisWeek);
              return (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-4 leading-snug">
                      {programmeName(p.programme_id)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
                      <Mono>{p.start_week_iso}</Mono>
                      {" → "}
                      <Mono>{p.end_week_iso ?? "ongoing"}</Mono>
                      {" · "}
                      {fmtWeekRange(p.start_week_iso)}
                    </div>
                  </div>
                  {active && (
                    <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ok/40 bg-ok/15 text-ok">
                      ACTIVE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void deletePhase(p.id)}
                    className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)]"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
