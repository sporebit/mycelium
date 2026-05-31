"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskStatus } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { isOverdue, isDueToday } from "@/lib/types/task";
import { Mono } from "@/components/dashboard/Mono";
import { StatusDropdown } from "./StatusDropdown";
import { UrgencyPill, pillToneFor } from "./UrgencyPill";

type SubStats = { done: number; total: number } | null;

type ContextAction =
  | { kind: "status"; value: TaskStatus }
  | { kind: "project"; value: string | null }
  | { kind: "due"; value: string | null }
  | { kind: "duplicate" }
  | { kind: "delete" };

export type TaskRowProps = {
  task: Task;
  selected: boolean;
  anySelected: boolean;
  subStats: SubStats;
  projects: Project[];
  onOpen: (t: Task) => void;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDuplicate: (t: Task) => void;
  onDelete: (t: Task) => void;
  onContext?: (t: Task, action: ContextAction) => void;
  isFocused?: boolean;
};

function formatDue(date: string, task: Task): { label: string; tone: string } {
  const overdue = isOverdue(task);
  const today = isDueToday(task);
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const label = due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (overdue) return { label, tone: "text-danger" };
  if (today) return { label, tone: "text-warn" };
  return { label, tone: "text-ink-3" };
}

export function TaskRowList({
  task,
  selected,
  anySelected,
  subStats,
  projects,
  onOpen,
  onToggleSelect,
  onPatch,
  onDuplicate,
  onDelete,
  isFocused,
}: TaskRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  function startEditingTitle() {
    setTitleDraft(task.title);
    setEditingTitle(true);
  }

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  function openContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function saveTitle() {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (!v || v === task.title) {
      setTitleDraft(task.title);
      return;
    }
    onPatch(task.id, { title: v });
  }

  const due = task.due_date ? formatDue(task.due_date, task) : null;
  const tags = (task.tags ?? []).slice(0, 2);
  const extraTagCount = (task.tags?.length ?? 0) - tags.length;
  const isCompleted = !!task.completed_at;

  return (
    <li
      onContextMenu={openContextMenu}
      onClick={() => {
        if (!editingTitle) onOpen(task);
      }}
      className={`group relative flex items-center gap-3 bg-ink-1 hover:bg-ink-2/60 rounded-md px-3 py-2 cursor-pointer transition-colors ${
        isFocused ? "ring-1 ring-glow-2/60" : ""
      } ${selected ? "ring-1 ring-accent/60 bg-accent/5" : ""} ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      {/* Checkbox: appears on hover OR when any selected */}
      <label
        onClick={(e) => e.stopPropagation()}
        className={`shrink-0 transition-opacity ${
          anySelected || selected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            onToggleSelect(
              task.id,
              e.nativeEvent as unknown as React.MouseEvent,
            );
          }}
          className="accent-accent h-3.5 w-3.5"
          aria-label={selected ? "Deselect" : "Select"}
        />
      </label>

      {/* Status pill */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <StatusDropdown
          value={task.status}
          onChange={(s) => onPatch(task.id, { status: s })}
          size="sm"
        />
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setTitleDraft(task.title);
                setEditingTitle(false);
              }
            }}
            className="w-full bg-transparent outline-none text-sm text-ink-4 border-b border-accent/60 pb-0.5"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditingTitle();
            }}
            className={`text-sm leading-snug break-words min-w-0 cursor-pointer ${
              isCompleted ? "text-ink-3 line-through" : "text-ink-4"
            }`}
          >
            {task.title}
          </div>
        )}
      </div>

      {/* Right side meta */}
      <div className="flex items-center gap-2 shrink-0 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)]">
        {subStats && subStats.total > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 text-ink-3"
            title={`${subStats.done} of ${subStats.total} sub-tasks done`}
          >
            {subStats.done}/{subStats.total}
          </span>
        )}
        {task.project_name && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/10 text-accent max-w-[140px] truncate"
            title={`Project: ${task.project_name}`}
          >
            {task.project_colour && (
              <span
                aria-hidden
                style={{ backgroundColor: task.project_colour }}
                className="h-1.5 w-1.5 rounded-full shrink-0"
              />
            )}
            <span className="truncate">{task.project_name}</span>
          </span>
        )}
        {due && (
          <Mono className={due.tone} title={`Due ${task.due_date}`}>
            {due.label}
          </Mono>
        )}
        <span className="shrink-0">
          <UrgencyPill tone={pillToneFor(task)} />
        </span>
        {tags.map((t) => (
          <span
            key={t}
            className="px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 text-ink-3 max-w-[80px] truncate"
          >
            {t}
          </span>
        ))}
        {extraTagCount > 0 && (
          <span className="text-ink-3">+{extraTagCount}</span>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          task={task}
          projects={projects}
          onClose={() => setMenu(null)}
          onPatch={onPatch}
          onDuplicate={() => onDuplicate(task)}
          onDelete={() => onDelete(task)}
        />
      )}
    </li>
  );
}

function ContextMenu({
  x,
  y,
  task,
  projects,
  onClose,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  task: Task;
  projects: Project[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState<null | "status" | "project" | "due">(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Clamp to viewport so menus opening near the bottom-right edge stay visible.
  const style = useMemo<React.CSSProperties>(() => {
    const w = 220;
    const h = 240;
    const maxX = typeof window !== "undefined" ? window.innerWidth - w - 8 : x;
    const maxY = typeof window !== "undefined" ? window.innerHeight - h - 8 : y;
    return {
      left: Math.min(x, maxX),
      top: Math.min(y, maxY),
    };
  }, [x, y]);

  return (
    <div
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={style}
      className="fixed z-[200] min-w-[220px] rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-1 flex flex-col gap-0.5 text-sm"
    >
      {open === "status" ? (
        <StatusSubmenu
          current={task.status}
          onPick={(s) => {
            onPatch(task.id, { status: s });
            onClose();
          }}
          onBack={() => setOpen(null)}
        />
      ) : open === "project" ? (
        <ProjectSubmenu
          current={task.project_id}
          projects={projects}
          onPick={(pid) => {
            onPatch(task.id, { project_id: pid });
            onClose();
          }}
          onBack={() => setOpen(null)}
        />
      ) : open === "due" ? (
        <DueSubmenu
          current={task.due_date}
          onPick={(d) => {
            onPatch(task.id, { due_date: d });
            onClose();
          }}
          onBack={() => setOpen(null)}
        />
      ) : (
        <>
          <MenuItem label="Change status →" onClick={() => setOpen("status")} />
          <MenuItem
            label="Move to project →"
            onClick={() => setOpen("project")}
          />
          <MenuItem label="Set due date →" onClick={() => setOpen("due")} />
          <MenuDivider />
          <MenuItem
            label="Duplicate"
            onClick={() => {
              onDuplicate();
              onClose();
            }}
          />
          <MenuItem
            label="Delete"
            danger
            onClick={() => {
              onDelete();
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-2.5 py-1.5 rounded-sm hover:bg-ink-2/60 transition-colors ${
        danger ? "text-danger" : "text-ink-4"
      }`}
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-ink-2 my-1" />;
}

function StatusSubmenu({
  current,
  onPick,
  onBack,
}: {
  current: TaskStatus;
  onPick: (s: TaskStatus) => void;
  onBack: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="text-left text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] text-ink-3 hover:text-ink-4 px-2 py-1"
      >
        ← Back
      </button>
      <MenuDivider />
      {(
        [
          "new",
          "in_progress",
          "blocked",
          "on_hold",
          "waiting_third_party",
          "review",
          "pending_review",
          "testing",
          "completed",
          "cancelled",
        ] as TaskStatus[]
      ).map((s) => (
        <MenuItem
          key={s}
          label={`${s === current ? "● " : "  "}${s.replace(/_/g, " ")}`}
          onClick={() => onPick(s)}
        />
      ))}
    </>
  );
}

function ProjectSubmenu({
  current,
  projects,
  onPick,
  onBack,
}: {
  current: string | null;
  projects: Project[];
  onPick: (id: string | null) => void;
  onBack: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="text-left text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] text-ink-3 hover:text-ink-4 px-2 py-1"
      >
        ← Back
      </button>
      <MenuDivider />
      <MenuItem
        label={`${current === null ? "● " : "  "}— No project —`}
        onClick={() => onPick(null)}
      />
      <div className="max-h-[200px] overflow-y-auto flex flex-col gap-0.5">
        {projects.map((p) => (
          <MenuItem
            key={p.id}
            label={`${p.id === current ? "● " : "  "}${p.name}`}
            onClick={() => onPick(p.id)}
          />
        ))}
      </div>
    </>
  );
}

function DueSubmenu({
  current,
  onPick,
  onBack,
}: {
  current: string | null;
  onPick: (d: string | null) => void;
  onBack: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="text-left text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] text-ink-3 hover:text-ink-4 px-2 py-1"
      >
        ← Back
      </button>
      <MenuDivider />
      <div className="px-2 py-1.5 flex items-center gap-2">
        <input
          type="date"
          defaultValue={current ?? ""}
          onChange={(e) => onPick(e.target.value || null)}
          className="flex-1 bg-ink-2 text-sm text-text-0 px-2 py-1 rounded-sm outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      </div>
      {current && (
        <MenuItem label="Clear due date" onClick={() => onPick(null)} />
      )}
    </>
  );
}
