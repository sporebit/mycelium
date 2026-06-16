"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  Task,
  TaskActivity,
  TaskComment,
  TaskStatus,
  TaskUrgency,
  LinkedCapture,
} from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import {
  URGENCIES,
  URGENCY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/types/task";
import { StatusDropdown } from "./StatusDropdown";
import { ConvertSection } from "./ConvertSection";
import type { ConvertibleKind } from "@/lib/convert/kinds";

function scheduledToUtc(date: string, time: string): string {
  const timePart = time || "09:00";
  const localIso = `${date}T${timePart}:00`;
  const asLondon = new Date(
    new Date(localIso).toLocaleString("en-US", { timeZone: "Europe/London" }),
  );
  return new Date(
    new Date(localIso).getTime() -
      (asLondon.getTime() - new Date(localIso).getTime()),
  ).toISOString();
}

function scheduledFromUtc(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = d
    .toLocaleString("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .split(", ");
  const [dd, mm, yyyy] = parts[0].split("/");
  return { date: `${yyyy}-${mm}-${dd}`, time: parts[1] ?? "09:00" };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function activityLabel(a: TaskActivity): string {
  if (a.action === "created") return "created the task";
  if (a.action === "comment") return "added a comment";
  if (a.action === "update" && a.field) {
    const f = a.field.replace(/_/g, " ");
    if (a.field === "status") {
      const from = a.from_value
        ? TASK_STATUS_LABEL[a.from_value as TaskStatus] ?? a.from_value
        : "?";
      const to = a.to_value
        ? TASK_STATUS_LABEL[a.to_value as TaskStatus] ?? a.to_value
        : "?";
      return `changed status from ${from} to ${to}`;
    }
    if (!a.from_value && a.to_value) return `set ${f} to ${a.to_value}`;
    if (a.from_value && !a.to_value) return `cleared ${f}`;
    return `changed ${f} from ${a.from_value} to ${a.to_value}`;
  }
  return a.action;
}

export function TaskDetailPane({
  task,
  comments,
  activity,
  subtasks,
  linkedCaptures,
  projects,
  onClose,
  onPatch,
  onAddComment,
  onDeleteComment,
  onAddSubtask,
  onJumpToTask,
  onTogglePatch,
  onDelete,
  onConverted,
  onError,
  loading,
}: {
  task: Task;
  comments: TaskComment[];
  activity: TaskActivity[];
  subtasks: Task[];
  linkedCaptures: LinkedCapture[];
  projects: Project[];
  onClose: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onAddSubtask: (title: string) => Promise<void>;
  onJumpToTask: (id: string) => void;
  onTogglePatch: (id: string, patch: Partial<Task>) => void;
  onDelete: () => void;
  onConverted?: (newKind: ConvertibleKind, newId: string) => void;
  onError?: (msg: string) => void;
  loading: boolean;
}) {
  const statusRef = useRef<HTMLDivElement | null>(null);
  const dueRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Drafts are lazy-initialised from the task prop. The parent keys this
  // component on task.id so switching tasks remounts and re-reads the
  // initial values; mid-edit, the user's in-progress text isn't clobbered
  // by background refetches.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const [descDraft, setDescDraft] = useState(task.description ?? "");
  const [commentDraft, setCommentDraft] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState((task.tags ?? []).join(", "));

  const focusStatus = useCallback(() => {
    const btn = statusRef.current?.querySelector("button");
    if (btn) (btn as HTMLButtonElement).click();
  }, []);

  const focusDue = useCallback(() => {
    dueRef.current?.focus();
    dueRef.current?.showPicker?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        focusStatus();
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        focusDue();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, focusStatus, focusDue]);

  function saveTitle() {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (!v || v === task.title) {
      setTitleDraft(task.title);
      return;
    }
    onPatch({ title: v });
  }

  function saveDesc() {
    if (descDraft === (task.description ?? "")) return;
    onPatch({ description: descDraft || null });
  }

  function saveTags() {
    const arr = tagsDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const current = (task.tags ?? []).join(",");
    if (arr.join(",") === current) return;
    onPatch({ tags: arr.length ? arr : null });
  }

  async function handleAddComment() {
    if (!commentDraft.trim()) return;
    const text = commentDraft.trim();
    setCommentDraft("");
    await onAddComment(text);
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!subDraft.trim()) return;
    const t = subDraft.trim();
    setSubDraft("");
    await onAddSubtask(t);
  }

  // Merge comments + activity into a single chronological feed.
  const feed = [
    ...comments.map((c) => ({
      kind: "comment" as const,
      at: c.created_at,
      data: c,
    })),
    ...activity.map((a) => ({
      kind: "activity" as const,
      at: a.created_at,
      data: a,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <aside
      className="detail-pane-slide-in flex flex-col h-full min-h-0 bg-ink-1 rounded-l-lg border-l border-ink-2 overflow-hidden"
      role="dialog"
      aria-label="Task detail"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink-2 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Task · created {formatDate(task.created_at)}
          </span>
          {task.converted_from && (
            <span
              title={`Converted from ${task.converted_from.from_kind} (id ${task.converted_from.from_id})`}
              className="text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-warn/40 bg-warn/15 text-warn shrink-0"
            >
              ⇄ from {task.converted_from.from_kind}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-7 w-7 flex items-center justify-center text-ink-3 hover:text-ink-4 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5 min-h-0">
        {/* Title + status */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full bg-transparent outline-none text-lg text-ink-4 border-b border-accent/60 pb-1"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
                className="w-full text-left text-lg text-ink-4 leading-tight hover:opacity-80 transition-opacity"
              >
                {task.title}
              </button>
            )}
          </div>
          <div ref={statusRef}>
            <StatusDropdown
              value={task.status}
              onChange={(s) => onPatch({ status: s })}
            />
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Description
          </span>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            placeholder="Add a description..."
            rows={4}
            className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 placeholder:italic p-2.5 resize-y outline-none focus:border-ink-3"
          />
        </div>

        {/* Sub-tasks */}
        {!task.parent_task_id && (
          <details open className="flex flex-col gap-2">
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] list-none">
              Sub-tasks{" "}
              {subtasks.length > 0 &&
                `· ${subtasks.filter((s) => s.completed_at).length}/${subtasks.length}`}
            </summary>
            <ul className="flex flex-col divide-y divide-ink-2/60">
              {subtasks.map((sub) => {
                const done = !!sub.completed_at;
                return (
                  <li key={sub.id} className="flex items-center gap-2 py-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onTogglePatch(sub.id, {
                          completed_at: done ? null : new Date().toISOString(),
                          status: done ? "new" : "completed",
                        })
                      }
                      aria-label={done ? "Mark not done" : "Mark done"}
                      className={`h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center text-[10px] leading-none transition-colors ${
                        done
                          ? "border-ok bg-ok text-ink-0"
                          : "border-ink-3 hover:border-ink-4"
                      }`}
                    >
                      {done && "✓"}
                    </button>
                    <StatusDropdown
                      size="sm"
                      value={sub.status}
                      onChange={(s) => onTogglePatch(sub.id, { status: s })}
                    />
                    <button
                      type="button"
                      onClick={() => onJumpToTask(sub.id)}
                      className={`flex-1 text-left text-sm leading-snug min-w-0 break-words ${
                        done ? "text-ink-3 line-through" : "text-ink-4 hover:text-accent"
                      } transition-colors`}
                    >
                      {sub.title}
                    </button>
                  </li>
                );
              })}
              {subtasks.length === 0 && (
                <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                  None yet.
                </li>
              )}
            </ul>
            <form
              onSubmit={handleAddSubtask}
              className="flex items-center gap-2 mt-1"
            >
              <span className="text-ink-3 text-sm shrink-0">+</span>
              <input
                type="text"
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                placeholder="Add subtask"
                className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)] border-b border-transparent focus:border-ink-2 pb-0.5"
              />
            </form>
          </details>
        )}

        {/* Activity / comments */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Activity
          </span>
          <div className="flex flex-col gap-2">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 placeholder:italic p-2 resize-y outline-none focus:border-ink-3"
            />
            <button
              type="button"
              disabled={!commentDraft.trim()}
              onClick={handleAddComment}
              className="self-end px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add comment
            </button>
          </div>
          <ul className="flex flex-col gap-3 mt-2">
            {loading ? (
              <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                Loading activity…
              </li>
            ) : feed.length === 0 ? (
              <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                No activity yet.
              </li>
            ) : (
              feed.map((entry) =>
                entry.kind === "comment" ? (
                  <li
                    key={`c-${entry.data.id}`}
                    className="rounded-md bg-ink-0/40 border border-ink-2 p-2.5 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                      <span>{entry.data.user_id}</span>
                      <div className="flex items-center gap-2">
                        <span>{formatDateTime(entry.data.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(entry.data.id)}
                          aria-label="Delete comment"
                          className="hover:text-danger transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-ink-4 whitespace-pre-wrap break-words">
                      {entry.data.body}
                    </p>
                  </li>
                ) : (
                  <li
                    key={`a-${entry.data.id}`}
                    className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] flex items-center gap-2"
                  >
                    <span className="text-ink-3">·</span>
                    <span className="flex-1">{activityLabel(entry.data)}</span>
                    <span>{formatDateTime(entry.data.created_at)}</span>
                  </li>
                ),
              )
            )}
          </ul>
        </div>
      </div>

      {/* Right-sidebar style fields, packed below scroll area */}
      <div className="border-t border-ink-2 shrink-0 max-h-[40vh] overflow-y-auto px-5 py-3 grid grid-cols-2 gap-3 text-sm">
        <Field label="Project">
          <select
            value={task.project_id ?? ""}
            onChange={(e) => onPatch({ project_id: e.target.value || null })}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {task.project_id &&
              !projects.some((p) => p.id === task.project_id) &&
              task.project_name && (
                <option value={task.project_id}>{task.project_name}</option>
              )}
          </select>
        </Field>
        <Field label="Urgency">
          <select
            value={task.urgency ?? "today"}
            onChange={(e) =>
              onPatch({ urgency: e.target.value as TaskUrgency })
            }
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <div className="flex items-center gap-1">
            <input
              ref={dueRef}
              type="date"
              value={task.due_date ?? ""}
              onChange={(e) =>
                onPatch({ due_date: e.target.value || null })
              }
              className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
            {task.due_date && (
              <button
                type="button"
                onClick={() => onPatch({ due_date: null })}
                aria-label="Clear due date"
                className="text-ink-3 hover:text-ink-4 text-sm px-1"
              >
                ✕
              </button>
            )}
          </div>
        </Field>
        <Field label="Scheduled for">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={
                task.scheduled_at
                  ? scheduledFromUtc(task.scheduled_at).date
                  : ""
              }
              onChange={(e) => {
                if (!e.target.value) {
                  onPatch({ scheduled_at: null });
                } else {
                  const curTime = task.scheduled_at
                    ? scheduledFromUtc(task.scheduled_at).time
                    : "09:00";
                  onPatch({
                    scheduled_at: scheduledToUtc(e.target.value, curTime),
                  });
                }
              }}
              className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
            <input
              type="time"
              value={
                task.scheduled_at
                  ? scheduledFromUtc(task.scheduled_at).time
                  : ""
              }
              onChange={(e) => {
                if (task.scheduled_at) {
                  const curDate = scheduledFromUtc(task.scheduled_at).date;
                  onPatch({
                    scheduled_at: scheduledToUtc(curDate, e.target.value),
                  });
                }
              }}
              className="w-24 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
            {task.scheduled_at && (
              <button
                type="button"
                onClick={() => onPatch({ scheduled_at: null })}
                aria-label="Clear scheduled date"
                className="text-ink-3 hover:text-ink-4 text-sm px-1"
              >
                ✕
              </button>
            )}
          </div>
        </Field>
        <Field label="Time est. (min)">
          <input
            type="number"
            min={0}
            value={task.time_estimate_min ?? ""}
            onChange={(e) =>
              onPatch({
                time_estimate_min: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            placeholder="30"
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          />
        </Field>
        <Field label="Tags">
          <input
            type="text"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={saveTags}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="comma, separated"
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          />
        </Field>
        <Field label="Owner">
          <input
            type="text"
            defaultValue={task.owner ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (task.owner ?? "")) return;
              onPatch({ owner: v || null });
            }}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          />
        </Field>
        <Field label="Created">
          <span className="text-xs text-ink-3 font-[family-name:var(--font-mono)] py-1.5">
            {formatDate(task.created_at)}
          </span>
        </Field>
        <Field label="Updated">
          <span className="text-xs text-ink-3 font-[family-name:var(--font-mono)] py-1.5">
            {formatDate(task.updated_at)}
          </span>
        </Field>
        {/* Convert this task to another record kind */}
        {onConverted && (
          <div className="col-span-2">
            <ConvertSection
              fromKind="task"
              fromId={task.id}
              fromTitle={task.title}
              onConverted={onConverted}
              onError={(m) => onError?.(m)}
            />
          </div>
        )}

        {linkedCaptures.length > 0 && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Linked captures ({linkedCaptures.length})
            </span>
            <ul className="flex flex-col gap-1">
              {linkedCaptures.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/organisation/captures`}
                    className="text-xs text-ink-3 hover:text-accent transition-colors block truncate"
                  >
                    {c.raw_text?.slice(0, 80) ?? `[${c.source}]`}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="px-5 py-3 border-t border-ink-2 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onDelete}
          className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-danger transition-colors"
        >
          DELETE
        </button>
        <button
          type="button"
          onClick={() =>
            onPatch({
              status: task.completed_at ? "new" : "completed",
              completed_at: task.completed_at ? null : new Date().toISOString(),
            })
          }
          className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            task.completed_at
              ? "bg-ink-2 text-ink-3 hover:bg-ink-2/80"
              : "bg-ok/15 border border-ok/40 text-ok hover:bg-ok/25"
          }`}
        >
          {task.completed_at ? "REOPEN" : "✓ MARK DONE"}
        </button>
      </footer>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </div>
  );
}
