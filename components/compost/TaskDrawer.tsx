"use client";

import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { DUE_WINDOW_LABEL, type DueWindow } from "@/lib/tickets/when";
import { EntityPicker } from "./EntityPicker";
import { triggerGlowPulse } from "@/lib/motion";
import { Sheet } from "@/components/ui/Sheet";
import { EntityForm } from "@/components/forms/EntityForm";
import { ENTITY_REGISTRY, emptyValues, type FieldErrors, type FieldValues } from "@/lib/capture/registry";

/** Create mode is the registry's task form (MYC-161); edit mode keeps its inline field editors. */
const TASK_DEF = ENTITY_REGISTRY.task;
const CREATE_FIELDS = ["title", "description", "due_window", "deadline_on", "key", "tags", "scheduled_at", "time_estimate_min", "owner", "entity_id", "project_id"] as const;

/** The drawer offers the windows that need no second pick; weekends and dates live on the ticket page. */
const WHEN_SELECT: readonly DueWindow[] = ["week", "month", "month_end", "someday"];

function formatCreatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

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

export type DrawerMode =
  | { kind: "edit"; task: Task }
  | { kind: "create" };

export function TaskDrawer({
  mode,
  onClose,
  onPatch,
  onCreate,
  onDelete,
  onError,
  parent,
  subTasks: childTasks,
  onJumpToTask,
}: {
  mode: DrawerMode;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Task>) => Promise<Task | null>;
  onCreate: (payload: Partial<Task>) => Promise<Task | null>;
  onDelete: (id: string) => Promise<boolean>;
  onError: (msg: string) => void;
  parent?: Task | null;
  subTasks?: Task[];
  onJumpToTask?: (taskId: string) => void;
}) {
  const isCreate = mode.kind === "create";
  const initialTask = mode.kind === "edit" ? mode.task : null;

  // Create mode: the registry form's values (MYC-161).
  const [draft, setDraft] = useState<FieldValues>(() => emptyValues(TASK_DEF));
  const [draftErrors, setDraftErrors] = useState<FieldErrors>({});
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let mounted = true;
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
  }, []);

  // Edit mode mirrors the task's text fields when the drawer mounts.
  // Parent remounts the drawer with a key={task.id} when switching tasks,
  // so lazy init is sufficient — no useEffect sync needed.
  const [editTitle, setEditTitle] = useState<string>(
    () => initialTask?.title ?? ""
  );
  const [editDesc, setEditDesc] = useState<string>(
    () => initialTask?.description ?? ""
  );
  const [editTagsStr, setEditTagsStr] = useState<string>(
    () => (initialTask?.tags ?? []).join(", ")
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) descInputRef.current?.focus();
  }, [editingDesc]);

  const task = mode.kind === "edit" ? mode.task : null;

  async function patchField<K extends keyof Task>(field: K, value: Task[K]) {
    if (!task) return;
    if (task[field] === value) return;
    const result = await onPatch(task.id, { [field]: value } as Partial<Task>);
    if (!result) onError(`Failed to update ${String(field)}`);
  }

  function parseTagsString(s: string): string[] {
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function saveTitle() {
    setEditingTitle(false);
    if (!task) return;
    const v = editTitle.trim();
    if (!v) {
      setEditTitle(task.title);
      return;
    }
    await patchField("title", v);
  }

  async function saveDesc() {
    setEditingDesc(false);
    if (!task) return;
    await patchField("description", editDesc || null);
  }

  async function saveTags() {
    if (!task) return;
    const arr = parseTagsString(editTagsStr);
    await patchField("tags", arr.length ? arr : null);
  }

  async function handleCreate() {
    if (creating) return;
    const errors = TASK_DEF.validate(draft);
    setDraftErrors(errors);
    if (Object.keys(errors).length) return;
    setCreating(true);
    const payload = TASK_DEF.toPostBody!(draft) as Partial<Task>;
    try {
      const created = await onCreate(payload);
      if (!created) onError("Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function handleMarkDone() {
    if (!task) return;
    const openKids = (childTasks ?? []).filter((c) => !c.completed_at);
    if (openKids.length > 0) {
      const proceed = window.confirm(
        `Mark parent done? ${openKids.length} sub-task${openKids.length === 1 ? "" : "s"} ${openKids.length === 1 ? "is" : "are"} still open. They'll remain visible until completed individually.`
      );
      if (!proceed) return;
    }
    const result = await onPatch(task.id, {
      completed_at: new Date().toISOString(),
    });
    if (!result) onError("Failed to mark done");
  }

  async function handleDelete() {
    if (!task) return;
    const kidsCount = childTasks?.length ?? 0;
    const msg =
      kidsCount > 0
        ? `Delete this task and ${kidsCount} sub-task${kidsCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${task.title}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    const ok = await onDelete(task.id);
    if (!ok) onError("Failed to delete");
  }

  // Inline sub-task add (only meaningful when editing a top-level task)
  const [subDraft, setSubDraft] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const canHaveChildren = !!task && !task.parent_task_id;

  async function addSubTask() {
    if (!task || !subDraft.trim() || addingSub) return;
    setAddingSub(true);
    try {
      const created = await onCreate({
        title: subDraft.trim(),
        parent_task_id: task.id,
      });
      if (!created) {
        onError("Failed to add sub-task");
        return;
      }
      setSubDraft("");
    } finally {
      setAddingSub(false);
    }
  }

  async function toggleSubDone(sub: Task) {
    await onPatch(sub.id, {
      completed_at: sub.completed_at ? null : new Date().toISOString(),
    });
  }

  const createdLabel = formatCreatedAt(task?.created_at);
  return (
    <Sheet
      open
      onClose={onClose}
      side="auto"
      title={isCreate ? "Create task" : "Edit task"}
    >
      {/* Sheet applies its own px-6/pb-6; cancel it so the drawer's existing
          section padding keeps the content layout exactly as it was. */}
      <div className="-mx-6 -mb-6 flex flex-col min-h-0">
        {/* Top close-row — no border, just the × in the corner */}
        <div className="flex items-center justify-end px-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center text-text-2 hover:text-text-0 text-base"
          >
            ✕
          </button>
        </div>

        {/* Title block */}
        <div className="px-8 pt-2 pb-4 flex flex-col gap-2">
          <div className="card-eyebrow">
            {isCreate ? "NEW TASK" : `TASK${createdLabel ? ` · created ${createdLabel}` : ""}`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-6 flex flex-col gap-6">
          {isCreate ? (
            <EntityForm def={TASK_DEF} only={CREATE_FIELDS} values={draft} onChange={setDraft} errors={draftErrors} disabled={creating} autoFocus onSubmit={handleCreate} />
          ) : (
          <>
          {/* PARENT REFERENCE (when editing a sub-task) */}
          {parent && (
            <button
              type="button"
              onClick={() => onJumpToTask?.(parent.id)}
              className="text-left text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-accent transition-colors font-[family-name:var(--font-mono)] flex items-center gap-1.5"
            >
              <span aria-hidden>↑</span>
              <span>Parent · {parent.title}</span>
            </button>
          )}

          {/* TITLE */}
          <Field label="Title">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    // Sheet closes on Escape from a window listener; stop the
                    // event here so cancelling an edit does not also close.
                    e.stopPropagation();
                    setEditTitle(task?.title ?? "");
                    setEditingTitle(false);
                  }
                }}
                className="w-full bg-transparent outline-none text-base text-ink-4 border-b border-accent pb-1.5"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="w-full text-left text-base text-ink-4 hover:opacity-80 transition-opacity border-b border-transparent pb-1.5"
              >
                {task?.title}
              </button>
            )}
          </Field>

          {/* DESCRIPTION */}
          <Field label="Description (markdown)">
            {editingDesc ? (
              <textarea
                ref={descInputRef}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditDesc(task?.description ?? "");
                    setEditingDesc(false);
                  }
                }}
                rows={4}
                className="w-full bg-ink-0/40 border border-accent rounded-md outline-none text-sm text-ink-4 p-2 resize-y"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDesc(true)}
                className="w-full text-left text-sm text-ink-4 whitespace-pre-wrap bg-ink-0/40 border border-ink-2 rounded-md p-2 min-h-[80px] hover:border-ink-3 transition-colors"
              >
                {task?.description || (
                  <span className="text-ink-3 italic">Click to add…</span>
                )}
              </button>
            )}
          </Field>

          {/* WHEN + KEY (tickets spec §18: a window that writes a deadline) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="When">
              <select
                value={task?.due_window ?? ""}
                onChange={(e) => {
                  const v = e.target.value as DueWindow | "";
                  patchField("due_window", v || null);
                }}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              >
                <option value="">No deadline</option>
                {WHEN_SELECT.map((w) => (
                  <option key={w} value={w}>
                    {DUE_WINDOW_LABEL[w]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Key">
              <button
                type="button"
                onClick={() => {
                  patchField("key", !task?.key);
                }}
                className={`w-full px-2 py-1.5 rounded-md border text-sm font-[family-name:var(--font-mono)] transition-colors ${
                  task?.key
                    ? "bg-danger/15 border-danger/40 text-danger"
                    : "bg-ink-0/40 border-ink-2 text-ink-3 hover:border-ink-3"
                }`}
              >
                {task?.key ? "★ KEY" : "☆ NOT KEY"}
              </button>
            </Field>
          </div>

          {/* TAGS */}
          <Field label="Tags (comma-separated)">
            {(
              <input
                type="text"
                value={editTagsStr}
                onChange={(e) => setEditTagsStr(e.target.value)}
                onBlur={saveTags}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTags();
                  }
                }}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              />
            )}
          </Field>

          {/* DUE + ESTIMATE */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={task?.due_date ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  patchField("due_date", v);
                }}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              />
            </Field>
            <Field label="Est. (min)">
              <input
                type="number"
                min={0}
                value={
                  task?.time_estimate_min !== null && task?.time_estimate_min !== undefined
                    ? String(task.time_estimate_min)
                    : ""
                }
                onChange={(e) => {
                  const n = e.target.value ? Number(e.target.value) : null;
                  patchField("time_estimate_min", n);
                }}
                placeholder="30"
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              />
            </Field>
          </div>

          {/* SCHEDULED AT */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled date">
              <input
                type="date"
                value={
                  task?.scheduled_at
                    ? scheduledFromUtc(task.scheduled_at).date
                    : ""
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    patchField("scheduled_at", null);
                  } else {
                    const curTime = task?.scheduled_at
                      ? scheduledFromUtc(task.scheduled_at).time
                      : "09:00";
                    patchField(
                      "scheduled_at",
                      scheduledToUtc(e.target.value, curTime),
                    );
                  }
                }}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              />
            </Field>
            <Field label="Scheduled time">
              <input
                type="time"
                value={
                  task?.scheduled_at
                    ? scheduledFromUtc(task.scheduled_at).time
                    : ""
                }
                onChange={(e) => {
                  if (task?.scheduled_at) {
                    const curDate = scheduledFromUtc(task.scheduled_at).date;
                    patchField(
                      "scheduled_at",
                      scheduledToUtc(curDate, e.target.value),
                    );
                  }
                }}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
              />
            </Field>
          </div>

          {/* OWNER */}
          <Field label="Owner">
            <input
              type="text"
              value={task?.owner ?? ""}
              onChange={(e) => {
                patchField("owner", e.target.value || null);
              }}
              placeholder={process.env.NEXT_PUBLIC_USER_ID ?? "phil"}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
            />
          </Field>

          {/* ENTITY */}
          <Field label="Entity">
            <EntityPicker
              value={task?.entity_id ?? null}
              valueName={task?.entity_name ?? null}
              onChange={(ent) => {
                patchField("entity_id", ent?.id ?? null);
              }}
              onError={onError}
            />
          </Field>

          {/* PROJECT */}
          <Field label="Project">
            <select
              value={task?.project_id ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                patchField("project_id", v);
              }}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {/* When editing, show the current project even if it's not
                  in the active list (e.g. archived or completed). */}
              {task?.project_id &&
                !projects.some((p) => p.id === task.project_id) &&
                task.project_name && (
                  <option value={task.project_id}>
                    {task.project_name} (inactive)
                  </option>
                )}
            </select>
          </Field>

          {/* SUB-TASKS (only for top-level tasks being edited) */}
          {canHaveChildren && (
            <Field
              label={`Sub-tasks${
                childTasks && childTasks.length > 0
                  ? ` · ${childTasks.filter((c) => c.completed_at).length}/${childTasks.length}`
                  : ""
              }`}
            >
              <ul className="flex flex-col divide-y divide-ink-2">
                {(childTasks ?? []).length === 0 ? (
                  <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                    None yet.
                  </li>
                ) : (
                  (childTasks ?? []).map((sub) => {
                    const done = !!sub.completed_at;
                    return (
                      <li
                        key={sub.id}
                        className="flex items-center gap-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSubDone(sub)}
                          aria-label={done ? "Mark not done" : "Mark done"}
                          className={`h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center text-[10px] leading-none transition-colors ${
                            done
                              ? "border-ok bg-ok text-ink-0"
                              : "border-ink-3 hover:border-ink-4"
                          }`}
                        >
                          {done && "✓"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onJumpToTask?.(sub.id)}
                          className={`flex-1 text-left text-sm leading-snug min-w-0 break-words ${
                            done
                              ? "text-ink-3 line-through"
                              : "text-ink-4 hover:text-accent"
                          } transition-colors`}
                        >
                          {sub.title}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addSubTask();
                }}
                className="flex items-center gap-2 mt-2"
              >
                <span className="text-ink-3 text-sm shrink-0">+</span>
                <input
                  type="text"
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  disabled={addingSub}
                  placeholder="add a sub-task"
                  className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)] border-b border-transparent focus:border-ink-2 pb-0.5"
                />
              </form>
            </Field>
          )}
          </>
          )}
        </div>

        <footer className="px-8 py-5 flex items-center gap-3 border-t border-ink-3/60">
          {isCreate ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 rounded-sm border border-ink-4 text-sm text-text-1 hover:text-text-0 hover:bg-ink-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={(e) => {
                  triggerGlowPulse(e.currentTarget);
                  handleCreate();
                }}
                className="ml-auto px-6 py-3 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {creating ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="px-6 py-3 rounded-sm border border-ink-4 text-sm text-text-1 hover:border-error/60 hover:text-error transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={(e) => {
                  triggerGlowPulse(e.currentTarget);
                  handleMarkDone();
                }}
                className="ml-auto px-6 py-3 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 text-sm font-medium transition-colors"
              >
                ✓ Mark Done
              </button>
            </>
          )}
        </footer>
      </div>
    </Sheet>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </div>
  );
}
