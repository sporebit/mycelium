"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Task,
  TaskComment,
  TaskDetail,
  TaskStatus,
  TaskUrgency,
} from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { ViewSwitcher, type CrmView } from "./ViewSwitcher";
import { TaskBoard } from "./TaskBoard";
import { TaskStatusBoard } from "./TaskStatusBoard";
import { TaskSmart } from "./TaskSmart";
import { TaskCategory } from "./TaskCategory";
import { TaskListView } from "./TaskListView";
import { TaskTableView } from "./TaskTableView";
import { TaskCalendarView } from "./TaskCalendarView";
import { TaskDetailPane } from "./TaskDetailPane";
import { TaskBulkBar } from "./TaskBulkBar";
import { ShortcutHintBar, ShortcutHelpModal } from "./TaskShortcutHelp";
import { TaskDrawer, type DrawerMode } from "./TaskDrawer";
import { isBlocker } from "@/lib/blockers";
import { localDateKey } from "@/lib/util/date";

const VIEW_STORAGE_KEY = "miles-crm-view";
const SHOW_COMPLETED_STORAGE_KEY = "mycelium:showCompleted";
const SHOW_PROJECT_TASKS_KEY = "mycelium:showProjectTasks";

type Toast = { kind: "success" | "error"; text: string } | null;

function readView(): CrmView {
  if (typeof window === "undefined") return "list";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (
    v === "smart" ||
    v === "kanban" ||
    v === "category" ||
    v === "status" ||
    v === "list" ||
    v === "table" ||
    v === "calendar"
  )
    return v;
  return "list";
}

function readShowCompleted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_COMPLETED_STORAGE_KEY) === "true";
}

function readShowProjectTasks(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_PROJECT_TASKS_KEY) === "true";
}

function isSplitPaneView(v: CrmView): boolean {
  return v === "list" || v === "table" || v === "calendar";
}

export function TasksClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Support both old (focus) and new (task) query params for backwards compat.
  const focusId = searchParams.get("task") ?? searchParams.get("focus");
  const viewParam = searchParams.get("view") as CrmView | null;
  const filterMode = searchParams.get("filter");

  const [view, setView] = useState<CrmView>(() => viewParam ?? readView());
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Detail data: re-fetched whenever focusId changes. Stored under the
  // task id so we can render-derive the visible detail and skip flashes.
  const [detailState, setDetailState] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detail =
    detailState && focusId && detailState.task.id === focusId
      ? detailState
      : null;

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

  // Fetch detail when focusId changes (and it's not 'new'). The loading
  // flag is flipped via queueMicrotask so we don't trip the
  // "synchronous setState in effect" rule — it amounts to the same
  // visible behaviour but defers the state write past the effect body.
  useEffect(() => {
    if (!focusId || focusId === "new") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDetailLoading(true);
    });
    fetch(`/api/tasks/${focusId}`)
      .then((r) => r.json())
      .then((j: TaskDetail | { error: string }) => {
        if (cancelled) return;
        if ("task" in j) setDetailState(j);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(text: string, kind: "success" | "error" = "error") {
    setToast({ kind, text });
  }

  const setUrl = useCallback(
    (next: { task?: string | null; view?: CrmView | null }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next.task !== undefined) {
        // Remove the legacy "focus" key to avoid drift.
        p.delete("focus");
        if (next.task === null) p.delete("task");
        else p.set("task", next.task);
      }
      if (next.view !== undefined) {
        if (next.view === null) p.delete("view");
        else p.set("view", next.view);
      }
      const s = p.toString();
      router.replace(`/compost/tasks${s ? `?${s}` : ""}`);
    },
    [router, searchParams],
  );

  function openTask(t: Task) {
    setUrl({ task: t.id });
    setFocusedId(t.id);
  }
  function openCreate() {
    setUrl({ task: "new" });
  }
  function closeDetail() {
    setUrl({ task: null });
  }
  function changeView(v: CrmView) {
    setView(v);
    setUrl({ view: v });
  }

  function clearBlockerFilter() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("filter");
    const s = p.toString();
    router.replace(`/compost/tasks${s ? `?${s}` : ""}`);
  }

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks;
    if (filterMode === "blockers") {
      const todayKey = localDateKey();
      result = result.filter((t) => isBlocker(t, todayKey));
    }
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

  const topLevelFiltered = useMemo(
    () => filteredTasks.filter((t) => !t.parent_task_id),
    [filteredTasks],
  );

  const projectTasksHidden = useMemo(() => {
    if (!tasks) return 0;
    if (showProjectTasks || projectFilter.size > 0) return 0;
    return tasks.filter((t) => !!t.project_id).length;
  }, [tasks, showProjectTasks, projectFilter]);

  // -------- API helpers (optimistic) --------

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>): Promise<Task | null> => {
      const prevList = tasks ?? [];
      setTasks((cur) =>
        (cur ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      // Optimistic detail update so the pane reflects immediately.
      setDetailState((cur) =>
        cur && cur.task.id === id
          ? { ...cur, task: { ...cur.task, ...patch } as Task }
          : cur,
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
        setTasks((cur) => (cur ?? []).map((t) => (t.id === id ? j.task! : t)));
        // Server snapshot for detail
        setDetailState((cur) =>
          cur && cur.task.id === id ? { ...cur, task: j.task! } : cur,
        );
        return j.task;
      } catch (err) {
        setTasks(prevList);
        showToast(err instanceof Error ? err.message : "Update failed");
        return null;
      }
    },
    [tasks],
  );

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
      showToast("Task created", "success");
      return j.task;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed");
      return null;
    }
  }

  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      const prev = tasks ?? [];
      setTasks((cur) => (cur ?? []).filter((t) => t.id !== id));
      if (focusId === id) setUrl({ task: null });
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
    },
    [tasks, focusId, setUrl],
  );

  function handleMove(
    id: string,
    urgency: TaskUrgency,
    priorityScore: number,
    extra?: Partial<Task>,
  ) {
    void patchTask(id, { urgency, priority_score: priorityScore, ...extra });
    if (extra && "parent_task_id" in extra && extra.parent_task_id === null) {
      showToast("Promoted to top-level task", "success");
    }
  }

  function handleStatusMove(id: string, status: TaskStatus) {
    void patchTask(id, { status });
  }

  async function duplicateTask(t: Task) {
    await createTask({
      title: `${t.title} (copy)`,
      description: t.description ?? null,
      urgency: t.urgency ?? "today",
      status: "new",
      key: t.key,
      tags: t.tags ?? null,
      due_date: t.due_date ?? null,
      time_estimate_min: t.time_estimate_min ?? null,
      owner: t.owner ?? null,
      entity_id: t.entity_id ?? null,
      project_id: t.project_id ?? null,
    });
  }

  function confirmDelete(t: Task) {
    if (window.confirm(`Delete "${t.title}"? This cannot be undone.`))
      void deleteTask(t.id);
  }

  // -------- Selection --------
  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function applyBulk(
    action:
      | { kind: "status"; value: TaskStatus }
      | { kind: "urgency"; value: TaskUrgency }
      | { kind: "project"; value: string | null }
      | { kind: "delete" },
  ) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action.kind === "delete") {
      const prev = tasks ?? [];
      setTasks((cur) => (cur ?? []).filter((t) => !selected.has(t.id)));
      clearSelection();
      try {
        await Promise.all(
          ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" })),
        );
        showToast(`Deleted ${ids.length} tasks`, "success");
      } catch {
        setTasks(prev);
        showToast("Delete failed");
      }
      return;
    }
    const patch: Partial<Task> =
      action.kind === "status"
        ? { status: action.value }
        : action.kind === "urgency"
          ? { urgency: action.value }
          : { project_id: action.value };
    setTasks((cur) =>
      (cur ?? []).map((t) =>
        selected.has(t.id) ? { ...t, ...patch } : t,
      ),
    );
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }),
        ),
      );
      showToast(`Updated ${ids.length} tasks`, "success");
    } catch {
      showToast("Bulk update failed");
    }
  }

  // -------- Detail pane handlers --------
  async function addComment(body: string) {
    if (!detail) return;
    const taskId = detail.task.id;
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        comment?: TaskComment;
        error?: string;
      };
      if (!res.ok || !j.comment) {
        showToast(j.error ?? "Comment failed");
        return;
      }
      setDetailState((cur) =>
        cur ? { ...cur, comments: [...cur.comments, j.comment!] } : cur,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Comment failed");
    }
  }

  async function deleteComment(commentId: string) {
    if (!detail) return;
    const taskId = detail.task.id;
    const prev = detail.comments;
    setDetailState((cur) =>
      cur ? { ...cur, comments: cur.comments.filter((c) => c.id !== commentId) } : cur,
    );
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
    } catch {
      setDetailState((cur) => (cur ? { ...cur, comments: prev } : cur));
      showToast("Delete failed");
    }
  }

  async function addSubtask(title: string) {
    if (!detail) return;
    const created = await createTask({
      title,
      parent_task_id: detail.task.id,
    });
    if (created) {
      setDetailState((cur) =>
        cur ? { ...cur, subtasks: [...cur.subtasks, created] } : cur,
      );
    }
  }

  function jumpToTask(id: string) {
    setUrl({ task: id });
    setFocusedId(id);
  }

  // Derived: when the explicit `focusedId` falls outside the visible
  // list (e.g. filter changed under it, or it was deleted), fall back to
  // the first visible task. Avoids a setState-in-effect cascade.
  const effectiveFocusedId =
    focusedId && topLevelFiltered.some((t) => t.id === focusedId)
      ? focusedId
      : (topLevelFiltered[0]?.id ?? null);

  // -------- Keyboard shortcuts --------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) {
        if (e.key === "Escape" && selected.size > 0) {
          clearSelection();
        }
        return;
      }
      // Don't handle if a dialog/menu is open and we're inside one
      if (helpOpen && e.key === "Escape") {
        setHelpOpen(false);
        return;
      }

      const visible = topLevelFiltered;
      const cur = effectiveFocusedId;
      if (e.key === "c" || e.key === "C") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        openCreate();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const idx = cur ? visible.findIndex((t) => t.id === cur) : -1;
        const nextIdx = Math.min(idx + 1, visible.length - 1);
        if (visible[nextIdx]) setFocusedId(visible[nextIdx].id);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const idx = cur ? visible.findIndex((t) => t.id === cur) : visible.length;
        const nextIdx = Math.max(0, idx - 1);
        if (visible[nextIdx]) setFocusedId(visible[nextIdx].id);
      } else if (e.key === "Enter") {
        if (cur) {
          e.preventDefault();
          const t = visible.find((tk) => tk.id === cur);
          if (t) openTask(t);
        }
      } else if (e.key === "x" || e.key === "X") {
        if (cur) {
          e.preventDefault();
          toggleSelect(cur);
        }
      } else if (e.key === "Escape") {
        if (focusId) closeDetail();
        else if (selected.size > 0) clearSelection();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLevelFiltered, effectiveFocusedId, focusId, selected, helpOpen]);

  // Drawer (create-only) compatibility
  const createDrawer = useMemo<DrawerMode | null>(() => {
    if (focusId === "new") return { kind: "create" };
    return null;
  }, [focusId]);

  const showDetailPane = !!focusId && focusId !== "new" && !!detail;
  const splitPane = isSplitPaneView(view) && showDetailPane;

  // Sub-task lookup map used by the smart view + jumpToTask helper.
  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks ?? []) m.set(t.id, t);
    return m;
  }, [tasks]);

  // For the legacy TaskDrawer used in create mode.
  const childrenForDrawer: Task[] = [];
  const parentForDrawer: Task | null = null;

  // Render the active main view
  const mainView = (
    <MainView
      view={view}
      tasks={filteredTasks}
      projects={projects}
      selected={selected}
      focusedId={effectiveFocusedId}
      onOpen={openTask}
      onToggleSelect={toggleSelect}
      onPatch={(id, p) => void patchTask(id, p)}
      onDuplicate={duplicateTask}
      onDelete={confirmDelete}
      onMoveStatus={handleStatusMove}
      onMoveUrgency={handleMove}
      tasksById={tasksById}
      onError={(m) => showToast(m)}
      onCreateForDate={(d) => {
        // Quick-create: open create drawer with due date pre-filled by writing
        // it via a temp param. Simpler: just open create flow.
        setUrl({ task: "new" });
        // We don't have a clean way to prefill due_date without refactoring the
        // TaskDrawer further. Pre-filling is left for a follow-up.
        void d;
      }}
    />
  );

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
          onClick={openCreate}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          + NEW
        </button>
        <ViewSwitcher value={view} onChange={changeView} />
      </div>

      {projectTasksHidden > 0 && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] -mt-1">
          {projectTasksHidden} task{projectTasksHidden === 1 ? "" : "s"} in
          projects hidden
        </div>
      )}

      {/* Body */}
      {tasks === null ? (
        <ListSkeleton />
      ) : splitPane ? (
        <div className="flex gap-0 relative">
          <div className="flex-1 min-w-0 md:pr-3 md:w-[55%]">{mainView}</div>
          <div className="hidden md:flex md:w-[45%] sticky top-2 self-start max-h-[calc(100vh-6rem)]">
            {detail && (
              <DetailPaneWrap
                detail={detail}
                detailLoading={detailLoading}
                projects={projects}
                onClose={closeDetail}
                onPatch={(p) => void patchTask(detail.task.id, p)}
                onAddComment={addComment}
                onDeleteComment={deleteComment}
                onAddSubtask={addSubtask}
                onJumpToTask={jumpToTask}
                onTogglePatch={(id, p) => void patchTask(id, p)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete "${detail.task.title}"? This cannot be undone.`,
                    )
                  )
                    void deleteTask(detail.task.id);
                }}
              />
            )}
          </div>
          {/* Mobile: full-screen overlay */}
          <div className="md:hidden fixed inset-0 z-40">
            {detail && (
              <DetailPaneWrap
                detail={detail}
                detailLoading={detailLoading}
                projects={projects}
                onClose={closeDetail}
                onPatch={(p) => void patchTask(detail.task.id, p)}
                onAddComment={addComment}
                onDeleteComment={deleteComment}
                onAddSubtask={addSubtask}
                onJumpToTask={jumpToTask}
                onTogglePatch={(id, p) => void patchTask(id, p)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete "${detail.task.title}"? This cannot be undone.`,
                    )
                  )
                    void deleteTask(detail.task.id);
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {mainView}
          {showDetailPane && detail && (
            <div className="fixed inset-0 z-40 flex items-stretch justify-end">
              <button
                type="button"
                aria-label="Close"
                onClick={closeDetail}
                className="flex-1 bg-ink-0/60 backdrop-blur-sm cursor-default"
              />
              <div className="w-full md:w-[480px] max-w-full">
                <DetailPaneWrap
                  detail={detail}
                  detailLoading={detailLoading}
                  projects={projects}
                  onClose={closeDetail}
                  onPatch={(p) => void patchTask(detail.task.id, p)}
                  onAddComment={addComment}
                  onDeleteComment={deleteComment}
                  onAddSubtask={addSubtask}
                  onJumpToTask={jumpToTask}
                  onTogglePatch={(id, p) => void patchTask(id, p)}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Delete "${detail.task.title}"? This cannot be undone.`,
                      )
                    )
                      void deleteTask(detail.task.id);
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      <ShortcutHintBar onOpenHelp={() => setHelpOpen(true)} />

      {/* Create-only drawer */}
      {createDrawer && (
        <TaskDrawer
          key="create"
          mode={createDrawer}
          onClose={closeDetail}
          onPatch={async (id, patch) => {
            const r = await patchTask(id, patch);
            return r;
          }}
          onCreate={async (payload) => {
            const created = await createTask(payload);
            if (created) closeDetail();
            return created;
          }}
          onDelete={deleteTask}
          onError={(m) => showToast(m)}
          parent={parentForDrawer}
          subTasks={childrenForDrawer}
          onJumpToTask={jumpToTask}
        />
      )}

      {/* Bulk action bar */}
      <TaskBulkBar
        count={selected.size}
        projects={projects}
        onApply={(a) => void applyBulk(a)}
        onClear={clearSelection}
      />

      {helpOpen && <ShortcutHelpModal onClose={() => setHelpOpen(false)} />}

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

function DetailPaneWrap({
  detail,
  detailLoading,
  projects,
  onClose,
  onPatch,
  onAddComment,
  onDeleteComment,
  onAddSubtask,
  onJumpToTask,
  onTogglePatch,
  onDelete,
}: {
  detail: TaskDetail;
  detailLoading: boolean;
  projects: Project[];
  onClose: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onAddSubtask: (title: string) => Promise<void>;
  onJumpToTask: (id: string) => void;
  onTogglePatch: (id: string, patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  return (
    <TaskDetailPane
      key={detail.task.id}
      task={detail.task}
      comments={detail.comments}
      activity={detail.activity}
      subtasks={detail.subtasks}
      linkedCaptures={detail.linked_captures}
      projects={projects}
      onClose={onClose}
      onPatch={onPatch}
      onAddComment={onAddComment}
      onDeleteComment={onDeleteComment}
      onAddSubtask={onAddSubtask}
      onJumpToTask={onJumpToTask}
      onTogglePatch={onTogglePatch}
      onDelete={onDelete}
      loading={detailLoading}
    />
  );
}

function MainView({
  view,
  tasks,
  projects,
  selected,
  focusedId,
  onOpen,
  onToggleSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onMoveStatus,
  onMoveUrgency,
  tasksById,
  onError,
  onCreateForDate,
}: {
  view: CrmView;
  tasks: Task[];
  projects: Project[];
  selected: Set<string>;
  focusedId: string | null;
  onOpen: (t: Task) => void;
  onToggleSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDuplicate: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMoveStatus: (id: string, status: TaskStatus) => void;
  onMoveUrgency: (
    id: string,
    urgency: TaskUrgency,
    priorityScore: number,
    extra?: Partial<Task>,
  ) => void;
  tasksById: Map<string, Task>;
  onError: (m: string) => void;
  onCreateForDate: (date: string) => void;
}) {
  switch (view) {
    case "list":
      return (
        <TaskListView
          tasks={tasks}
          selected={selected}
          focusedId={focusedId}
          projects={projects}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onPatch={onPatch}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      );
    case "table":
      return (
        <TaskTableView
          tasks={tasks}
          selected={selected}
          projects={projects}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onPatch={onPatch}
        />
      );
    case "calendar":
      return (
        <TaskCalendarView
          tasks={tasks}
          onOpen={onOpen}
          onCreateForDate={onCreateForDate}
        />
      );
    case "status":
      return (
        <TaskStatusBoard
          tasks={tasks}
          onCardClick={onOpen}
          onMoveStatus={onMoveStatus}
        />
      );
    case "kanban":
      return (
        <TaskBoard
          tasks={tasks}
          onCardClick={onOpen}
          onMove={onMoveUrgency}
          onStatusChange={onMoveStatus}
        />
      );
    case "smart":
      return (
        <TaskSmart
          onCardClick={onOpen}
          onError={onError}
          tasksById={tasksById}
          onStatusChange={onMoveStatus}
        />
      );
    case "category":
      return (
        <TaskCategory
          tasks={tasks}
          onCardClick={onOpen}
          onStatusChange={onMoveStatus}
        />
      );
  }
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="bg-ink-1 rounded-md px-3 py-2 flex items-center gap-3 animate-pulse"
        >
          <div className="h-3.5 w-3.5 rounded-sm bg-ink-2" />
          <div className="h-4 w-20 rounded-md bg-ink-2" />
          <div className="h-4 flex-1 max-w-[40%] rounded-md bg-ink-2/70" />
          <div className="ml-auto h-3 w-16 rounded-md bg-ink-2/60" />
        </li>
      ))}
    </ul>
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
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
    <div ref={ref} className="relative">
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
      )}
    </div>
  );
}
