"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Task, TaskStatus, TaskUrgency } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { ViewSwitcher, type CrmView } from "./ViewSwitcher";
import { TaskBoard } from "./TaskBoard";
import { TaskStatusBoard } from "./TaskStatusBoard";
import { TaskSmart } from "./TaskSmart";
import { TaskCategory } from "./TaskCategory";
import { TaskDrawer, type DrawerMode } from "./TaskDrawer";
import { isBlocker } from "@/lib/blockers";
import { localDateKey } from "@/lib/util/date";

const VIEW_STORAGE_KEY = "miles-crm-view";
const SHOW_COMPLETED_STORAGE_KEY = "mycelium:showCompleted";
const SHOW_PROJECT_TASKS_KEY = "mycelium:showProjectTasks";

type Toast = { kind: "success" | "error"; text: string } | null;

function readView(): CrmView {
  if (typeof window === "undefined") return "status";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "smart" || v === "kanban" || v === "category" || v === "status")
    return v;
  return "status";
}

function readShowCompleted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_COMPLETED_STORAGE_KEY) === "true";
}

function readShowProjectTasks(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_PROJECT_TASKS_KEY) === "true";
}

export function TasksClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const filterMode = searchParams.get("filter");

  const [view, setView] = useState<CrmView>(() => readView());
  const [showCompleted, setShowCompleted] = useState<boolean>(() =>
    readShowCompleted(),
  );
  const [showProjectTasks, setShowProjectTasks] = useState<boolean>(() =>
    readShowProjectTasks(),
  );
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SHOW_COMPLETED_STORAGE_KEY,
      showCompleted ? "true" : "false",
    );
  }, [showCompleted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SHOW_PROJECT_TASKS_KEY,
      showProjectTasks ? "true" : "false",
    );
  }, [showProjectTasks]);

  // Fetch tasks. Re-fires when showCompleted flips so the API filter
  // matches the displayed set — the API ignores completed tasks by
  // default and includes them when include_completed=true is passed.
  useEffect(() => {
    let mounted = true;
    const url = showCompleted
      ? "/api/tasks?status=open&include_completed=true"
      : "/api/tasks?status=open";
    fetch(url)
      .then((r) => r.json())
      .then((j: { tasks?: Task[] }) => {
        if (!mounted) return;
        setTasks(Array.isArray(j?.tasks) ? j.tasks : []);
      })
      .catch(() => mounted && setTasks([]));
    fetch("/api/projects?status=active")
      .then((r) => r.json())
      .then((j: { projects?: Project[] }) => {
        if (!mounted) return;
        setProjects(Array.isArray(j?.projects) ? j.projects : []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [showCompleted]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(text: string, kind: "success" | "error" = "error") {
    setToast({ kind, text });
  }

  // Drawer state derives purely from the URL focus param + the task list.
  // No useEffect / no setDrawer — opening/closing the drawer is done via
  // setDrawerUrl below, which only touches the URL.
  const drawer = useMemo<DrawerMode | null>(() => {
    if (!focusId) return null;
    if (focusId === "new") return { kind: "create" };
    if (!tasks) return null;
    const t = tasks.find((x) => x.id === focusId);
    return t ? { kind: "edit", task: t } : null;
  }, [focusId, tasks]);

  function setDrawerUrl(next: DrawerMode | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (next === null) {
      p.delete("focus");
    } else if (next.kind === "create") {
      p.set("focus", "new");
    } else {
      p.set("focus", next.task.id);
    }
    const s = p.toString();
    router.replace(`/crm/tasks${s ? `?${s}` : ""}`);
  }

  function clearBlockerFilter() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("filter");
    const s = p.toString();
    router.replace(`/crm/tasks${s ? `?${s}` : ""}`);
  }

  // Combined filter: blockers (URL) + project (toolbar) + search (toolbar)
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks;
    if (filterMode === "blockers") {
      const todayKey = localDateKey();
      result = result.filter((t) => isBlocker(t, todayKey));
    }
    // Project tasks are hidden by default — only show them when the
    // toggle is on. Explicit project filter selection always wins so a
    // user can drill into a project from a different surface.
    if (!showProjectTasks && projectFilter.size === 0) {
      result = result.filter((t) => !t.project_id);
    }
    if (projectFilter.size > 0) {
      result = result.filter((t) => {
        const key = t.project_id ?? "__none__";
        return projectFilter.has(key);
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/);
      result = result.filter((t) => {
        const hay = [
          t.title,
          t.description ?? "",
          t.entity_name ?? "",
          t.project_name ?? "",
          ...(t.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((tok) => hay.includes(tok));
      });
    }
    return result;
  }, [tasks, search, filterMode, projectFilter, showProjectTasks]);

  const projectTasksHidden = useMemo(() => {
    if (!tasks) return 0;
    if (showProjectTasks || projectFilter.size > 0) return 0;
    return tasks.filter((t) => !!t.project_id).length;
  }, [tasks, showProjectTasks, projectFilter]);

  // -------- API helpers (optimistic) --------

  async function patchTask(
    id: string,
    patch: Partial<Task>
  ): Promise<Task | null> {
    const prevList = tasks ?? [];
    setTasks((cur) =>
      (cur ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setTasks(prevList);
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? `Update failed (${res.status})`);
        return null;
      }
      const j = (await res.json()) as { task?: Task };
      if (!j.task) return null;

      setTasks((cur) =>
        (cur ?? []).map((t) => (t.id === id ? j.task! : t))
      );
      // The drawer derives from tasks.find(focusId), so no manual sync needed.
      // If the task got completed (mark done), remove from open list & close
      // drawer — unless the SHOW COMPLETED toggle is on, in which case the
      // user wants to see it stay put with the COMPLETED styling.
      if (j.task.completed_at) {
        if (!showCompleted) {
          setTasks((cur) => (cur ?? []).filter((t) => t.id !== id));
          setDrawerUrl(null);
        }
        showToast("Marked done", "success");
      }
      return j.task;
    } catch (err) {
      setTasks(prevList);
      showToast(err instanceof Error ? err.message : "Update failed");
      return null;
    }
  }

  async function createTask(payload: Partial<Task>): Promise<Task | null> {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { task?: Task; error?: string };
      if (!res.ok || !j.task) {
        showToast(j.error ?? `Create failed (${res.status})`);
        return null;
      }
      setTasks((cur) => [j.task!, ...(cur ?? [])]);
      setDrawerUrl(null);
      showToast("Task created", "success");
      return j.task;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed");
      return null;
    }
  }

  async function deleteTask(id: string): Promise<boolean> {
    const prev = tasks ?? [];
    setTasks((cur) => (cur ?? []).filter((t) => t.id !== id));
    setDrawerUrl(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTasks(prev);
        showToast("Delete failed");
        return false;
      }
      showToast("Deleted", "success");
      return true;
    } catch (err) {
      setTasks(prev);
      showToast(err instanceof Error ? err.message : "Delete failed");
      return false;
    }
  }

  function handleMove(
    id: string,
    urgency: TaskUrgency,
    priorityScore: number,
    extra?: Partial<Task>
  ) {
    void patchTask(id, { urgency, priority_score: priorityScore, ...extra });
    if (extra && "parent_task_id" in extra && extra.parent_task_id === null) {
      showToast("Promoted to top-level task", "success");
    }
  }

  function handleStatusMove(id: string, status: TaskStatus) {
    void patchTask(id, { status });
  }

  // Look-up maps for the drawer + smart view
  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks ?? []) m.set(t.id, t);
    return m;
  }, [tasks]);

  const childrenForDrawer: Task[] = useMemo(() => {
    if (!drawer || drawer.kind !== "edit") return [];
    const parentId = drawer.task.id;
    return (tasks ?? []).filter((t) => t.parent_task_id === parentId);
  }, [drawer, tasks]);

  const parentForDrawer: Task | null = useMemo(() => {
    if (!drawer || drawer.kind !== "edit") return null;
    const pid = drawer.task.parent_task_id;
    return pid ? (tasksById.get(pid) ?? null) : null;
  }, [drawer, tasksById]);

  function jumpToTask(id: string) {
    const t = tasksById.get(id);
    if (t) setDrawerUrl({ kind: "edit", task: t });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Active filter banner */}
      {filterMode === "blockers" && (
        <div className="flex items-center justify-between rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          <span>Filter · Blockers only</span>
          <button
            type="button"
            onClick={clearBlockerFilter}
            className="text-danger hover:text-ink-4 transition-colors"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {view !== "smart" && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter…"
            className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 placeholder:text-ink-3 outline-none focus:border-ink-3 transition-colors w-64"
          />
        )}
        {view === "smart" && <div className="w-64" />}
        {projects.length > 0 && view !== "smart" && (
          <ProjectFilterDropdown
            projects={projects}
            selected={projectFilter}
            onChange={setProjectFilter}
          />
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          aria-pressed={showCompleted}
          title={
            showCompleted
              ? "Hide completed tasks"
              : "Show completed tasks at the bottom of each bucket"
          }
          className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            showCompleted
              ? "bg-ok/15 border-ok/40 text-ok hover:bg-ok/25"
              : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
          }`}
        >
          {showCompleted ? "✓ COMPLETED ON" : "SHOW COMPLETED"}
        </button>
        <button
          type="button"
          onClick={() => setShowProjectTasks((v) => !v)}
          aria-pressed={showProjectTasks}
          title={
            showProjectTasks
              ? "Hide tasks attached to a project"
              : "Show tasks attached to a project"
          }
          className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            showProjectTasks
              ? "bg-accent/15 border-accent/40 text-accent hover:bg-accent/25"
              : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
          }`}
        >
          {showProjectTasks ? "✓ PROJECT TASKS" : "SHOW PROJECT TASKS"}
        </button>
        <button
          type="button"
          onClick={() => setDrawerUrl({ kind: "create" })}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          + NEW
        </button>
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      {projectTasksHidden > 0 && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] -mt-1">
          {projectTasksHidden} task{projectTasksHidden === 1 ? "" : "s"} in
          projects hidden
        </div>
      )}

      {/* Body */}
      {tasks === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading tasks…
        </div>
      ) : view === "status" ? (
        <TaskStatusBoard
          tasks={filteredTasks}
          onCardClick={(t) => setDrawerUrl({ kind: "edit", task: t })}
          onMoveStatus={handleStatusMove}
        />
      ) : view === "kanban" ? (
        <TaskBoard
          tasks={filteredTasks}
          onCardClick={(t) => setDrawerUrl({ kind: "edit", task: t })}
          onMove={handleMove}
        />
      ) : view === "smart" ? (
        <TaskSmart
          onCardClick={(t) => setDrawerUrl({ kind: "edit", task: t })}
          onError={(m) => showToast(m)}
          tasksById={tasksById}
        />
      ) : (
        <TaskCategory
          tasks={filteredTasks}
          onCardClick={(t) => setDrawerUrl({ kind: "edit", task: t })}
        />
      )}

      {/* Drawer — keyed so it remounts (and re-reads task into local draft
          state) when the focused task changes. */}
      {drawer && (
        <TaskDrawer
          key={drawer.kind === "edit" ? drawer.task.id : "create"}
          mode={drawer}
          onClose={() => setDrawerUrl(null)}
          onPatch={patchTask}
          onCreate={createTask}
          onDelete={deleteTask}
          onError={(m) => showToast(m)}
          parent={parentForDrawer}
          subTasks={childrenForDrawer}
          onJumpToTask={jumpToTask}
        />
      )}

      {/* Toast */}
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

function ProjectFilterDropdown({
  projects,
  selected,
  onChange,
}: {
  projects: Project[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function clear() {
    onChange(new Set());
  }

  const count = selected.size;
  const label =
    count === 0
      ? "ALL PROJECTS"
      : count === 1
        ? (() => {
            const only = Array.from(selected)[0];
            if (only === "__none__") return "NO PROJECT";
            return (
              projects.find((p) => p.id === only)?.name.toUpperCase() ??
              "1 PROJECT"
            );
          })()
        : `${count} PROJECTS`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
          count > 0
            ? "border-accent/40 bg-accent/15 text-accent"
            : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
        }`}
      >
        ◆ {label}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute z-50 left-0 mt-2 w-64 max-h-80 overflow-y-auto rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Filter by project
              </span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
                >
                  Clear
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-ink-2/40 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has("__none__")}
                onChange={() => toggle("__none__")}
                className="accent-accent"
              />
              <span className="text-sm text-ink-3 italic">No project</span>
            </label>
            {projects.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-ink-2/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-accent"
                />
                {p.colour && (
                  <span
                    aria-hidden
                    style={{ backgroundColor: p.colour }}
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                  />
                )}
                <span className="text-sm text-text-0 truncate flex-1">
                  {p.name}
                </span>
              </label>
            ))}
            {projects.length === 0 && (
              <div className="px-2 py-3 text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                No active projects yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
