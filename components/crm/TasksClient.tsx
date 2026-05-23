"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Task, TaskUrgency } from "@/lib/types/task";
import { ViewSwitcher, type CrmView } from "./ViewSwitcher";
import { TaskBoard } from "./TaskBoard";
import { TaskSmart } from "./TaskSmart";
import { TaskCategory } from "./TaskCategory";
import { TaskDrawer, type DrawerMode } from "./TaskDrawer";
import { isBlocker } from "@/lib/blockers";
import { localDateKey } from "@/lib/util/date";

const VIEW_STORAGE_KEY = "miles-crm-view";

type Toast = { kind: "success" | "error"; text: string } | null;

function readView(): CrmView {
  if (typeof window === "undefined") return "kanban";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "smart" || v === "kanban" || v === "category") return v;
  return "kanban";
}

export function TasksClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const filterMode = searchParams.get("filter");
  const consumedFocus = useRef<string | null>(null);

  const [view, setView] = useState<CrmView>("kanban");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Restore view preference
  useEffect(() => {
    setView(readView());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Fetch tasks
  useEffect(() => {
    let mounted = true;
    fetch("/api/tasks?status=open")
      .then((r) => r.json())
      .then((j: { tasks?: Task[] }) => {
        if (!mounted) return;
        setTasks(Array.isArray(j?.tasks) ? j.tasks : []);
      })
      .catch(() => mounted && setTasks([]));
    return () => {
      mounted = false;
    };
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(text: string, kind: "success" | "error" = "error") {
    setToast({ kind, text });
  }

  // Auto-open drawer when ?focus=ID is present
  useEffect(() => {
    if (!tasks || !focusId) return;
    if (consumedFocus.current === focusId) return;
    const t = tasks.find((x) => x.id === focusId);
    if (t) {
      setDrawer({ kind: "edit", task: t });
      consumedFocus.current = focusId;
    }
  }, [tasks, focusId]);

  function clearBlockerFilter() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("filter");
    const s = p.toString();
    router.replace(`/crm/tasks${s ? `?${s}` : ""}`);
  }

  // Combined filter: blockers (URL) + search (toolbar)
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks;
    if (filterMode === "blockers") {
      const todayKey = localDateKey();
      result = result.filter((t) => isBlocker(t, todayKey));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/);
      result = result.filter((t) => {
        const hay = [
          t.title,
          t.description ?? "",
          t.entity_name ?? "",
          ...(t.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((tok) => hay.includes(tok));
      });
    }
    return result;
  }, [tasks, search, filterMode]);

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
      // If this task is open in the drawer, sync
      setDrawer((d) =>
        d && d.kind === "edit" && d.task.id === id
          ? { kind: "edit", task: j.task! }
          : d
      );
      // If the task got completed (mark done), remove from open list & close drawer
      if (j.task.completed_at) {
        setTasks((cur) => (cur ?? []).filter((t) => t.id !== id));
        setDrawer(null);
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
      setDrawer(null);
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
    setDrawer(null);
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

  function handleMove(id: string, urgency: TaskUrgency, priorityScore: number) {
    void patchTask(id, { urgency, priority_score: priorityScore });
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
      <div className="flex items-center gap-3">
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
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setDrawer({ kind: "create" })}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          + NEW
        </button>
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      {/* Body */}
      {tasks === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading tasks…
        </div>
      ) : view === "kanban" ? (
        <TaskBoard
          tasks={filteredTasks}
          onCardClick={(t) => setDrawer({ kind: "edit", task: t })}
          onMove={handleMove}
        />
      ) : view === "smart" ? (
        <TaskSmart
          onCardClick={(t) => setDrawer({ kind: "edit", task: t })}
          onError={(m) => showToast(m)}
        />
      ) : (
        <TaskCategory
          tasks={filteredTasks}
          onCardClick={(t) => setDrawer({ kind: "edit", task: t })}
        />
      )}

      {/* Drawer */}
      {drawer && (
        <TaskDrawer
          mode={drawer}
          onClose={() => setDrawer(null)}
          onPatch={patchTask}
          onCreate={createTask}
          onDelete={deleteTask}
          onError={(m) => showToast(m)}
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
