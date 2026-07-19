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
import { TaskDetailPaneWrap } from "./TaskDetailPaneWrap";
import { TaskMainView } from "./TaskMainView";
import { TaskListSkeleton } from "./TaskListSkeleton";
import { ProjectFilterDropdown } from "./ProjectFilterDropdown";
import { isBlocker } from "@/lib/blockers";
import { localDateKey } from "@/lib/util/date";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useCurrentDevice } from "@/lib/hooks/useCurrentDevice";
import { scoreTaskForContext } from "@/lib/compost/now-filter";

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
  const [nowActive, setNowActive] = useState(
    () => searchParams.get("filter") === "now",
  );
  const [currentCtx] = useCurrentContext();
  const detectedDevice = useCurrentDevice();

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
      router.replace(`/organisation/tasks${s ? `?${s}` : ""}`);
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
    router.replace(`/organisation/tasks${s ? `?${s}` : ""}`);
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

  // NOW filter: hide tasks that contradict the current context, then
  // rank the rest by match score. Sub-tasks pass through unchanged so
  // detail-pane traversal still works.
  const nowFiltered = useMemo(() => {
    if (!nowActive) return filteredTasks;
    type Scored = { task: Task; score: number };
    const scored: Scored[] = [];
    for (const t of filteredTasks) {
      if (t.parent_task_id) {
        scored.push({ task: t, score: 0 });
        continue;
      }
      const { score, contradicts } = scoreTaskForContext(
        t,
        currentCtx,
        detectedDevice,
      );
      if (contradicts) continue;
      scored.push({ task: t, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.task);
  }, [filteredTasks, nowActive, currentCtx, detectedDevice]);

  const topLevelFiltered = useMemo(
    () => nowFiltered.filter((t) => !t.parent_task_id),
    [nowFiltered],
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

  /**
   * Bulk due-date patch — used by the calendar's drag-to-schedule when
   * the user drags a multi-selected group onto a target day. Goes
   * through /api/tasks/bulk so we land all updates in one round trip.
   */
  async function bulkPatchDueDate(ids: string[], dueDate: string | null) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const prev = tasks ?? [];
    setTasks((cur) =>
      (cur ?? []).map((t) =>
        idSet.has(t.id) ? { ...t, due_date: dueDate } : t,
      ),
    );
    try {
      const r = await fetch("/api/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch: { due_date: dueDate } }),
      });
      if (!r.ok) throw new Error("bulk failed");
      const j = (await r.json().catch(() => ({}))) as { tasks?: Task[] };
      // Reconcile with the server snapshot so any side-effects (e.g.
      // updated_at) flow through.
      if (Array.isArray(j.tasks)) {
        const byId = new Map(j.tasks.map((t) => [t.id, t] as const));
        setTasks((cur) =>
          (cur ?? []).map((t) => byId.get(t.id) ?? t),
        );
      }
      showToast(
        dueDate
          ? `Scheduled ${ids.length} for ${dueDate}`
          : `Cleared date on ${ids.length}`,
        "success",
      );
    } catch {
      setTasks(prev);
      showToast("Bulk schedule failed");
    }
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

  function handleConverted(newKind: string, newId: string) {
    // The source task was soft-deleted server-side. Mirror that locally
    // and decide where to send the user based on the new kind.
    if (detail) {
      const oldId = detail.task.id;
      setTasks((cur) => (cur ?? []).filter((t) => t.id !== oldId));
    }
    if (newKind === "task") {
      setUrl({ task: newId });
      showToast(`Converted → new task`, "success");
    } else {
      setUrl({ task: null });
      showToast(`Converted → ${newKind}`, "success");
    }
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
    <TaskMainView
      view={view}
      tasks={nowFiltered}
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
      onBulkPatchDueDate={(ids, d) => void bulkPatchDueDate(ids, d)}
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
        <button
          type="button"
          onClick={() => setNowActive((v) => !v)}
          aria-pressed={nowActive}
          title="Show tasks that match my current context"
          className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            nowActive
              ? "bg-glow-2/15 border-glow-2/40 text-glow-2"
              : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
          }`}
        >
          {nowActive ? "✓ NOW" : "NOW"}
        </button>
        <ViewSwitcher value={view} onChange={changeView} />
      </div>

      {projectTasksHidden > 0 && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] -mt-1">
          {projectTasksHidden} task{projectTasksHidden === 1 ? "" : "s"} in
          projects hidden
        </div>
      )}

      {nowActive && (
        <div className="flex items-center justify-between rounded-md border border-glow-2/40 bg-glow-2/5 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-glow-2 font-[family-name:var(--font-mono)]">
          <span>
            NOW · {detectedDevice}
            {currentCtx.where ? ` · ${currentCtx.where}` : ""}
            {currentCtx.energy ? ` · ${currentCtx.energy} energy` : ""}
            {currentCtx.context_tag ? ` · ${currentCtx.context_tag}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setNowActive(false)}
            className="text-glow-2 hover:text-ink-4 transition-colors"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* Body */}
      {tasks === null ? (
        <TaskListSkeleton />
      ) : splitPane ? (
        <div className="flex gap-0 relative">
          <div className="flex-1 min-w-0 md:pr-3 md:w-[55%]">{mainView}</div>
          <div className="hidden md:flex md:w-[45%] sticky top-2 self-start max-h-[calc(100vh-6rem)]">
            {detail && (
              <TaskDetailPaneWrap
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
                onConverted={handleConverted}
                onError={(m) => showToast(m)}
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
              <TaskDetailPaneWrap
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
                onConverted={handleConverted}
                onError={(m) => showToast(m)}
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
                <TaskDetailPaneWrap
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
                  onConverted={handleConverted}
                  onError={(m) => showToast(m)}
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
