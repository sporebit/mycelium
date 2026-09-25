"use client";

import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { ticketPrefs } from "@/lib/settings/uiPrefs";
import { useProjects } from "@/components/tickets/pickers";
import type { AreaChoice } from "@/lib/tickets/areaChip";

/**
 * The Area chip (tasks-merge M2): All · Technical · Life · a project. One
 * row on every tab of the Tasks home; the choice is sticky per user in
 * ui_prefs.tickets.area and every list on the page reads it.
 */
export function AreaChip() {
  const { prefs, setPrefs, isLoading } = useUiPrefs();
  const tp = ticketPrefs(prefs);
  const area = tp.area;
  const projects = useProjects();

  const set = (next: AreaChoice) => void setPrefs({ tickets: { ...tp, area: next } });
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
      active ? "border-glow-2/50 bg-glow-2/15 text-glow-2" : "border-ink-2 bg-ink-0/40 text-ink-3 hover:border-ink-3 hover:text-ink-4"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Area">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Area</span>
      {(["all", "technical", "life"] as const).map((k) => (
        <button
          key={k}
          type="button"
          disabled={isLoading}
          aria-pressed={area.kind === k}
          onClick={() => set({ kind: k, project_id: null })}
          className={chip(area.kind === k)}
          title={k === "all" ? "Every ticket" : k === "technical" ? "Projects in a Technical area" : "Life: everything else, including tickets with no project"}
        >
          {k === "all" ? "All" : k === "technical" ? "Technical" : "Life"}
        </button>
      ))}
      <select
        value={area.kind === "project" && area.project_id ? area.project_id : ""}
        disabled={isLoading}
        onChange={(e) => (e.target.value ? set({ kind: "project", project_id: e.target.value }) : set({ kind: "all", project_id: null }))}
        className={`${chip(area.kind === "project")} bg-ink-0/40 cursor-pointer`}
        aria-label="Project"
      >
        <option value="">Project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.prefix ? `${p.prefix} · ${p.name}` : p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
