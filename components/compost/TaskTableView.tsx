"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskUrgency } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { isOverdue, isDueToday } from "@/lib/types/task";
import { StatusDropdown } from "./StatusDropdown";
import { URGENCIES, URGENCY_LABEL } from "@/lib/types/task";

type ColumnId =
  | "select"
  | "status"
  | "title"
  | "project"
  | "urgency"
  | "due"
  | "tags"
  | "time"
  | "created"
  | "updated";

type ColumnDef = { id: ColumnId; label: string; defaultWidth: number };

const COLUMNS: ColumnDef[] = [
  { id: "select", label: "", defaultWidth: 36 },
  { id: "status", label: "Status", defaultWidth: 130 },
  { id: "title", label: "Title", defaultWidth: 280 },
  { id: "project", label: "Project", defaultWidth: 140 },
  { id: "urgency", label: "Urgency", defaultWidth: 110 },
  { id: "due", label: "Due", defaultWidth: 110 },
  { id: "tags", label: "Tags", defaultWidth: 160 },
  { id: "time", label: "Time", defaultWidth: 70 },
  { id: "created", label: "Created", defaultWidth: 110 },
  { id: "updated", label: "Updated", defaultWidth: 110 },
];

const STORAGE_KEY = "mycelium:task-table-v1";

type SortDir = "asc" | "desc";
type SortState = { col: ColumnId; dir: SortDir } | null;

function loadPersisted(): {
  order?: ColumnId[];
  widths?: Partial<Record<ColumnId, number>>;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ReturnType<typeof loadPersisted>;
  } catch {
    return {};
  }
}

function savePersisted(state: {
  order: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — non-fatal */
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function TaskTableView({
  tasks,
  selected,
  projects,
  onOpen,
  onToggleSelect,
  onPatch,
}: {
  tasks: Task[];
  selected: Set<string>;
  projects: Project[];
  onOpen: (t: Task) => void;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}) {
  const persisted = useMemo(() => loadPersisted(), []);
  const [order, setOrder] = useState<ColumnId[]>(
    () =>
      persisted.order && persisted.order.length === COLUMNS.length
        ? persisted.order
        : COLUMNS.map((c) => c.id),
  );
  const [widths, setWidths] = useState<Partial<Record<ColumnId, number>>>(
    () => persisted.widths ?? {},
  );
  const [sort, setSort] = useState<SortState>(null);
  const [editing, setEditing] = useState<{
    id: string;
    col: ColumnId;
  } | null>(null);

  useEffect(() => {
    savePersisted({ order, widths });
  }, [order, widths]);

  const orderedCols = useMemo(
    () =>
      order
        .map((id) => COLUMNS.find((c) => c.id === id))
        .filter((c): c is ColumnDef => !!c),
    [order],
  );

  const sortedTasks = useMemo(() => {
    const arr = tasks.filter((t) => !t.parent_task_id).slice();
    if (!sort) return arr;
    const { col, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortValue(a, col);
      const bv = sortValue(b, col);
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return av > bv ? sign : -sign;
    });
    return arr;
  }, [tasks, sort]);

  function toggleSort(col: ColumnId) {
    if (col === "select") return;
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: "asc" };
      if (cur.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }

  // Column drag-reorder
  const dragColRef = useRef<ColumnId | null>(null);

  // Column resize
  const resizingRef = useRef<{ id: ColumnId; startX: number; startW: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const next = Math.max(40, r.startW + dx);
      setWidths((cur) => ({ ...cur, [r.id]: next }));
    }
    function onUp() {
      resizingRef.current = null;
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startResize(id: ColumnId, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const col = COLUMNS.find((c) => c.id === id);
    const startW = widths[id] ?? col?.defaultWidth ?? 120;
    resizingRef.current = { id, startX: e.clientX, startW };
    document.body.style.userSelect = "none";
  }

  function colWidth(id: ColumnId): number {
    return widths[id] ?? COLUMNS.find((c) => c.id === id)?.defaultWidth ?? 120;
  }

  if (sortedTasks.length === 0) {
    return (
      <div className="rounded-md bg-ink-1 p-12 text-center">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No tasks match your filters.
        </p>
      </div>
    );
  }

  const allSelected =
    sortedTasks.length > 0 && sortedTasks.every((t) => selected.has(t.id));

  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 overflow-x-auto">
      <table className="w-full table-fixed text-sm" style={{ minWidth: 800 }}>
        <thead>
          <tr className="border-b border-ink-2">
            {orderedCols.map((col) => (
              <th
                key={col.id}
                draggable={col.id !== "select"}
                onDragStart={() => {
                  dragColRef.current = col.id;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragColRef.current;
                  dragColRef.current = null;
                  if (!from || from === col.id) return;
                  setOrder((cur) => {
                    const next = cur.filter((c) => c !== from);
                    const idx = next.indexOf(col.id);
                    next.splice(idx, 0, from);
                    return next;
                  });
                }}
                style={{ width: colWidth(col.id) }}
                className="relative text-left text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] px-2 py-2 select-none"
              >
                {col.id === "select" ? (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      const ids = sortedTasks.map((t) => t.id);
                      if (allSelected) {
                        ids.forEach((id) => onToggleSelect(id));
                      } else {
                        ids.forEach((id) => {
                          if (!selected.has(id)) onToggleSelect(id);
                        });
                      }
                    }}
                    className="accent-accent h-3.5 w-3.5"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.id)}
                    className="text-left hover:text-ink-4 transition-colors cursor-pointer"
                  >
                    {col.label}
                    {sort?.col === col.id ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                )}
                <span
                  onMouseDown={(e) => startResize(col.id, e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-ink-2"
                  aria-hidden
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((t) => (
            <tr
              key={t.id}
              className={`group border-b border-ink-2/40 hover:bg-ink-2/30 transition-colors ${
                selected.has(t.id) ? "bg-accent/5" : ""
              } ${t.completed_at ? "opacity-60" : ""}`}
            >
              {orderedCols.map((col) => (
                <td
                  key={col.id}
                  style={{ width: colWidth(col.id) }}
                  className="px-2 py-1.5 align-middle"
                >
                  <Cell
                    col={col.id}
                    task={t}
                    projects={projects}
                    selected={selected.has(t.id)}
                    editing={editing?.id === t.id && editing.col === col.id}
                    onStartEdit={() => setEditing({ id: t.id, col: col.id })}
                    onEndEdit={() => setEditing(null)}
                    onOpen={() => onOpen(t)}
                    onToggleSelect={() => onToggleSelect(t.id)}
                    onPatch={(patch) => onPatch(t.id, patch)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortValue(t: Task, col: ColumnId): string | number | null {
  switch (col) {
    case "status":
      return t.status;
    case "title":
      return t.title.toLowerCase();
    case "project":
      return t.project_name?.toLowerCase() ?? null;
    case "urgency":
      return URGENCIES.indexOf(t.urgency ?? "someday");
    case "due":
      return t.due_date ?? null;
    case "tags":
      return (t.tags ?? []).join(",").toLowerCase();
    case "time":
      return t.time_estimate_min ?? null;
    case "created":
      return t.created_at;
    case "updated":
      return t.updated_at;
    default:
      return null;
  }
}

function Cell({
  col,
  task,
  projects,
  selected,
  editing,
  onStartEdit,
  onEndEdit,
  onOpen,
  onToggleSelect,
  onPatch,
}: {
  col: ColumnId;
  task: Task;
  projects: Project[];
  selected: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  onPatch: (patch: Partial<Task>) => void;
}) {
  if (col === "select") {
    return (
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="accent-accent h-3.5 w-3.5"
        aria-label={selected ? "Deselect" : "Select"}
      />
    );
  }
  if (col === "status") {
    return (
      <StatusDropdown
        size="sm"
        value={task.status}
        onChange={(s) => onPatch({ status: s })}
      />
    );
  }
  if (col === "title") {
    if (editing) {
      return (
        <input
          autoFocus
          type="text"
          defaultValue={task.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            onEndEdit();
            if (v && v !== task.title) onPatch({ title: v });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") onEndEdit();
          }}
          className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onStartEdit}
        className={`text-left text-sm w-full truncate ${
          task.completed_at ? "line-through text-ink-3" : "text-ink-4"
        }`}
        title={task.title}
      >
        {task.title}
      </button>
    );
  }
  if (col === "project") {
    if (editing) {
      return (
        <select
          autoFocus
          defaultValue={task.project_id ?? ""}
          onChange={(e) => {
            onPatch({ project_id: e.target.value || null });
            onEndEdit();
          }}
          onBlur={onEndEdit}
          className="w-full bg-ink-2 rounded-sm text-xs text-text-0 px-1.5 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        >
          <option value="">— None —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-left w-full truncate text-xs uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] text-ink-3 hover:text-ink-4"
        title={task.project_name ?? "— None —"}
      >
        {task.project_name ? (
          <span className="inline-flex items-center gap-1">
            {task.project_colour && (
              <span
                aria-hidden
                style={{ backgroundColor: task.project_colour }}
                className="h-1.5 w-1.5 rounded-full inline-block"
              />
            )}
            <span className="truncate">{task.project_name}</span>
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </button>
    );
  }
  if (col === "urgency") {
    if (editing) {
      return (
        <select
          autoFocus
          defaultValue={task.urgency ?? "today"}
          onChange={(e) => {
            onPatch({ urgency: e.target.value as TaskUrgency });
            onEndEdit();
          }}
          onBlur={onEndEdit}
          className="w-full bg-ink-2 rounded-sm text-xs text-text-0 px-1.5 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        >
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABEL[u]}
            </option>
          ))}
        </select>
      );
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-left w-full text-xs uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] text-ink-3 hover:text-ink-4"
      >
        {URGENCY_LABEL[task.urgency ?? "someday"]}
      </button>
    );
  }
  if (col === "due") {
    if (editing) {
      return (
        <input
          autoFocus
          type="date"
          defaultValue={task.due_date ?? ""}
          onBlur={(e) => {
            onPatch({ due_date: e.target.value || null });
            onEndEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") onEndEdit();
          }}
          className="w-full bg-ink-2 rounded-sm text-xs text-text-0 px-1.5 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      );
    }
    const overdue = isOverdue(task);
    const today = isDueToday(task);
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className={`text-left w-full text-xs font-[family-name:var(--font-mono)] ${
          overdue ? "text-danger" : today ? "text-warn" : "text-ink-3"
        } hover:text-ink-4`}
      >
        {task.due_date ? fmtDate(task.due_date) : "—"}
      </button>
    );
  }
  if (col === "tags") {
    if (editing) {
      return (
        <input
          autoFocus
          type="text"
          defaultValue={(task.tags ?? []).join(", ")}
          onBlur={(e) => {
            const arr = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onPatch({ tags: arr.length ? arr : null });
            onEndEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") onEndEdit();
          }}
          className="w-full bg-ink-2 rounded-sm text-xs text-text-0 px-1.5 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-left w-full text-xs text-ink-3 truncate hover:text-ink-4"
      >
        {(task.tags ?? []).join(", ") || "—"}
      </button>
    );
  }
  if (col === "time") {
    if (editing) {
      return (
        <input
          autoFocus
          type="number"
          min={0}
          defaultValue={task.time_estimate_min ?? ""}
          onBlur={(e) => {
            const n = e.target.value ? Number(e.target.value) : null;
            onPatch({ time_estimate_min: n });
            onEndEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") onEndEdit();
          }}
          className="w-full bg-ink-2 rounded-sm text-xs text-text-0 px-1.5 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-left w-full text-xs text-ink-3 font-[family-name:var(--font-mono)] tabular-nums hover:text-ink-4"
      >
        {task.time_estimate_min != null ? `${task.time_estimate_min}m` : "—"}
      </button>
    );
  }
  if (col === "created") {
    return (
      <span className="text-xs text-ink-3 font-[family-name:var(--font-mono)]">
        {fmtDate(task.created_at)}
      </span>
    );
  }
  if (col === "updated") {
    return (
      <span className="text-xs text-ink-3 font-[family-name:var(--font-mono)]">
        {fmtDate(task.updated_at)}
      </span>
    );
  }
  return null;
}
