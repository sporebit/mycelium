"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import {
  PROJECT_STATUS_LABEL,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";
import type { Task, TaskStatus } from "@/lib/types/task";
import { TaskStatusBoard } from "./TaskStatusBoard";

type Filter = ProjectStatus | "all";
type View = "list" | "kanban";
const VIEW_KEY = "mycelium:projectsView";

const COLOUR_PRESETS = [
  "#7dd3fc", // sky
  "#84f5b8", // mycelium glow
  "#cba956", // accent gold
  "#f5b56d", // amber
  "#e07a5f", // burnt umber
  "#a78bfa", // lavender
  "#34d399", // emerald
  "#f472b6", // pink
];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "ACTIVE" },
  { value: "archived", label: "ARCHIVED" },
  { value: "completed", label: "COMPLETED" },
  { value: "all", label: "ALL" },
];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function statusToneClass(s: ProjectStatus): string {
  if (s === "active") return "bg-accent/15 text-accent border-accent/40";
  if (s === "completed") return "bg-ok/15 text-ok border-ok/40";
  return "bg-ink-2 text-ink-3 border-ink-2";
}

function initialView(): View {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_KEY);
  if (v === "kanban" || v === "list") return v;
  return "list";
}

export function ProjectsClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [view, setView] = useState<View>(initialView);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    colour: COLOUR_PRESETS[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kanban-mode state. `kanbanFilter === null` means the user hasn't
  // touched the filter — we render with the implicit default of "all
  // active projects" computed from the loaded project list.
  const [kanbanTasks, setKanbanTasks] = useState<Task[] | null>(null);
  const [kanbanFilter, setKanbanFilter] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: { projects?: Project[] }) => {
        if (!mounted) return;
        setProjects(Array.isArray(j?.projects) ? j.projects : []);
      })
      .catch(() => mounted && setProjects([]));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "kanban") return;
    let mounted = true;
    fetch("/api/tasks?status=open&include_completed=true")
      .then((r) => r.json())
      .then((j: { tasks?: Task[] }) => {
        if (!mounted) return;
        setKanbanTasks(Array.isArray(j?.tasks) ? j.tasks : []);
      })
      .catch(() => mounted && setKanbanTasks([]));
    return () => {
      mounted = false;
    };
  }, [view]);

  // Effective filter: explicit user selection wins; otherwise default
  // to all active projects so the kanban shows something meaningful on
  // first open without an effect that mutates state.
  const effectiveKanbanFilter = useMemo<Set<string>>(() => {
    if (kanbanFilter !== null) return kanbanFilter;
    if (!projects) return new Set<string>();
    return new Set(
      projects.filter((p) => p.status === "active").map((p) => p.id),
    );
  }, [kanbanFilter, projects]);

  const kanbanProjectTasks = useMemo(() => {
    if (!kanbanTasks) return [];
    return kanbanTasks.filter(
      (t) => t.project_id !== null && effectiveKanbanFilter.has(t.project_id),
    );
  }, [kanbanTasks, effectiveKanbanFilter]);

  async function patchKanbanTask(id: string, status: TaskStatus) {
    const prev = kanbanTasks ?? [];
    setKanbanTasks((cur) =>
      (cur ?? []).map((t) => (t.id === id ? { ...t, status } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setKanbanTasks(prev);
        setError("Status update failed");
        return;
      }
      const j = (await res.json()) as { task?: Task };
      if (j.task) {
        setKanbanTasks((cur) =>
          (cur ?? []).map((t) => (t.id === id ? j.task! : t))
        );
      }
    } catch {
      setKanbanTasks(prev);
      setError("Status update failed");
    }
  }

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  const visible = useMemo(() => {
    if (!projects) return [];
    if (filter === "all") return projects;
    return projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  async function createProject() {
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: draft.description.trim() || null,
          colour: draft.colour.trim() || null,
        }),
      });
      const j = (await res.json()) as { project?: Project; error?: string };
      if (!res.ok || !j.project) {
        setError(j.error ?? "Create failed");
        return;
      }
      setProjects((cur) => [j.project!, ...(cur ?? [])]);
      setDraft({ name: "", description: "", colour: COLOUR_PRESETS[0] });
      setShowNew(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border border-ink-2 overflow-hidden">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
                    active
                      ? "bg-accent/15 text-accent"
                      : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="inline-flex rounded-md border border-ink-2 bg-ink-0/40 p-0.5">
            {(["list", "kanban"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
                  view === v
                    ? "bg-ink-2 text-ink-4"
                    : "text-ink-3 hover:text-ink-4"
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          {showNew ? "× CANCEL" : "+ NEW PROJECT"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {showNew && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createProject();
          }}
          className="rounded-md bg-ink-1 p-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Name
            </span>
            <input
              autoFocus
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Project name"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Description (optional)
            </span>
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={2}
              placeholder="What's this project for?"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 resize-y"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
              Colour
            </legend>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOUR_PRESETS.map((c) => {
                const active = draft.colour.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, colour: c }))}
                    aria-label={`Colour ${c}`}
                    aria-pressed={active}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      active
                        ? "border-text-0 scale-110"
                        : "border-ink-2 hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
              <input
                type="color"
                value={draft.colour || "#cba956"}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, colour: e.target.value }))
                }
                className="h-7 w-9 rounded-sm border border-ink-2 bg-transparent cursor-pointer"
                aria-label="Pick custom colour"
              />
              <input
                type="text"
                value={draft.colour}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, colour: e.target.value }))
                }
                placeholder="#cba956"
                className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-1.5 outline outline-1 outline-transparent focus:outline-glow-2 w-28 font-[family-name:var(--font-mono)]"
              />
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="px-4 py-2 rounded-sm border border-ink-4 text-sm text-text-1 hover:text-text-0 hover:bg-ink-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !draft.name.trim()}
              className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {view === "kanban" && projects !== null && (
        <KanbanProjectFilter
          projects={projects}
          selected={effectiveKanbanFilter}
          onChange={(next) => setKanbanFilter(next)}
        />
      )}

      {view === "kanban" ? (
        kanbanTasks === null ? (
          <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
            Loading project tasks…
          </div>
        ) : kanbanProjectTasks.length === 0 ? (
          <div className="rounded-md bg-ink-1 p-8 text-center">
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              {effectiveKanbanFilter.size === 0
                ? "Select projects to view their tasks on the kanban."
                : "No tasks in the selected projects."}
            </p>
          </div>
        ) : (
          <TaskStatusBoard
            tasks={kanbanProjectTasks}
            onCardClick={(t) => router.push(`/compost/tasks?focus=${t.id}`)}
            onMoveStatus={(id, status) => void patchKanbanTask(id, status)}
          />
        )
      ) : projects === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading projects…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {filter === "all"
              ? "No projects yet."
              : `No ${PROJECT_STATUS_LABEL[filter as ProjectStatus].toLowerCase()} projects.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <li key={p.id}>
              <Link
                href={`/compost/projects/${p.id}`}
                className="block bg-ink-1 rounded-md p-4 hover:bg-ink-2/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {p.colour && (
                    <span
                      aria-hidden
                      style={{ backgroundColor: p.colour }}
                      className="h-3 w-3 rounded-full shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-text-0 truncate">
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-xs text-ink-3 truncate mt-0.5">
                        {p.description}
                      </div>
                    )}
                  </div>
                  <Mono className="text-[11px] text-ink-3 shrink-0">
                    {p.task_count ?? 0} {p.task_count === 1 ? "task" : "tasks"}
                  </Mono>
                  <span
                    className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${statusToneClass(p.status)}`}
                  >
                    {PROJECT_STATUS_LABEL[p.status]}
                  </span>
                  <Mono className="text-[10px] text-ink-3 shrink-0 hidden sm:block">
                    {fmtDate(p.created_at)}
                  </Mono>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KanbanProjectFilter({
  projects,
  selected,
  onChange,
}: {
  projects: Project[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const activeProjects = projects.filter((p) => p.status === "active");
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }
  function selectAll() {
    onChange(new Set(activeProjects.map((p) => p.id)));
  }
  function clear() {
    onChange(new Set());
  }
  return (
    <div className="rounded-md bg-ink-1 p-3 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mr-1">
        Projects
      </span>
      {activeProjects.length === 0 ? (
        <span className="text-sm italic text-ink-3 font-[family-name:var(--font-display)]">
          No active projects.
        </span>
      ) : (
        <>
          {activeProjects.map((p) => {
            const active = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.04em] transition-colors ${
                  active
                    ? "border-text-0/60 bg-ink-2 text-text-0"
                    : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
                }`}
              >
                {p.colour && (
                  <span
                    aria-hidden
                    style={{ backgroundColor: p.colour }}
                    className="h-2.5 w-2.5 rounded-full"
                  />
                )}
                {p.name}
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            type="button"
            onClick={selectAll}
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            All
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
