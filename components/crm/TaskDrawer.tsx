"use client";

import { useEffect, useRef, useState } from "react";
import type { Task, TaskUrgency, Entity } from "@/lib/types/task";
import { URGENCIES, URGENCY_LABEL } from "@/lib/types/task";
import { EntityPicker } from "./EntityPicker";

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

  // Local draft state for create mode
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftUrgency, setDraftUrgency] = useState<TaskUrgency>("today");
  const [draftKey, setDraftKey] = useState(false);
  const [draftTags, setDraftTags] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftEst, setDraftEst] = useState<string>("");
  const [draftOwner, setDraftOwner] = useState<string>("");
  const [draftEntity, setDraftEntity] = useState<Entity | null>(null);
  const [creating, setCreating] = useState(false);

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingTitle && !editingDesc) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, editingTitle, editingDesc]);

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
    if (!draftTitle.trim() || creating) return;
    setCreating(true);
    const payload: Partial<Task> = {
      title: draftTitle.trim(),
      description: draftDesc.trim() || null,
      urgency: draftUrgency,
      key: draftKey,
      tags: parseTagsString(draftTags).length ? parseTagsString(draftTags) : null,
      due_date: draftDue || null,
      time_estimate_min: draftEst ? Number(draftEst) || null : null,
      owner: draftOwner.trim() || null,
      entity_id: draftEntity?.id ?? null,
    };
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

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm"
      />
      <aside
        className="absolute top-0 right-0 h-full w-full max-w-[400px] bg-ink-1 border-l border-ink-2 shadow-2xl flex flex-col"
        role="dialog"
        aria-label={isCreate ? "Create task" : "Edit task"}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            {isCreate ? "New Task" : "Edit Task"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* PARENT REFERENCE (when editing a sub-task) */}
          {!isCreate && parent && (
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
            {isCreate ? (
              <input
                autoFocus
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="What needs doing?"
                className="w-full bg-transparent outline-none text-base text-ink-4 placeholder:text-ink-3 border-b border-ink-2 focus:border-accent pb-1.5 transition-colors"
              />
            ) : editingTitle ? (
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
            {isCreate ? (
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="Details, links, notes…"
                rows={4}
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md outline-none text-sm text-ink-4 placeholder:text-ink-3 p-2 resize-y focus:border-ink-3"
              />
            ) : editingDesc ? (
              <textarea
                ref={descInputRef}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
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

          {/* URGENCY + KEY */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Urgency">
              <select
                value={isCreate ? draftUrgency : task?.urgency ?? "today"}
                onChange={(e) => {
                  const v = e.target.value as TaskUrgency;
                  if (isCreate) setDraftUrgency(v);
                  else patchField("urgency", v);
                }}
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
              >
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABEL[u]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Key">
              <button
                type="button"
                onClick={() => {
                  if (isCreate) setDraftKey((v) => !v);
                  else patchField("key", !task?.key);
                }}
                className={`w-full px-2 py-1.5 rounded-md border text-sm font-[family-name:var(--font-mono)] transition-colors ${
                  (isCreate ? draftKey : task?.key)
                    ? "bg-danger/15 border-danger/40 text-danger"
                    : "bg-ink-0/40 border-ink-2 text-ink-3 hover:border-ink-3"
                }`}
              >
                {(isCreate ? draftKey : task?.key) ? "★ KEY" : "☆ NOT KEY"}
              </button>
            </Field>
          </div>

          {/* TAGS */}
          <Field label="Tags (comma-separated)">
            {isCreate ? (
              <input
                type="text"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="work, personal, q3…"
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 px-2 py-1.5 outline-none focus:border-ink-3"
              />
            ) : (
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
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
              />
            )}
          </Field>

          {/* DUE + ESTIMATE */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={isCreate ? draftDue : task?.due_date ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  if (isCreate) setDraftDue(e.target.value);
                  else patchField("due_date", v);
                }}
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
              />
            </Field>
            <Field label="Est. (min)">
              <input
                type="number"
                min={0}
                value={
                  isCreate
                    ? draftEst
                    : task?.time_estimate_min !== null && task?.time_estimate_min !== undefined
                      ? String(task.time_estimate_min)
                      : ""
                }
                onChange={(e) => {
                  if (isCreate) setDraftEst(e.target.value);
                  else {
                    const n = e.target.value ? Number(e.target.value) : null;
                    patchField("time_estimate_min", n);
                  }
                }}
                placeholder="30"
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 px-2 py-1.5 outline-none focus:border-ink-3"
              />
            </Field>
          </div>

          {/* OWNER */}
          <Field label="Owner">
            <input
              type="text"
              value={isCreate ? draftOwner : task?.owner ?? ""}
              onChange={(e) => {
                if (isCreate) setDraftOwner(e.target.value);
                else patchField("owner", e.target.value || null);
              }}
              placeholder={process.env.NEXT_PUBLIC_USER_ID ?? "phil"}
              className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 px-2 py-1.5 outline-none focus:border-ink-3"
            />
          </Field>

          {/* ENTITY */}
          <Field label="Entity">
            <EntityPicker
              value={isCreate ? draftEntity?.id ?? null : task?.entity_id ?? null}
              valueName={isCreate ? draftEntity?.name ?? null : task?.entity_name ?? null}
              onChange={(ent) => {
                if (isCreate) setDraftEntity(ent);
                else patchField("entity_id", ent?.id ?? null);
              }}
              onError={onError}
            />
          </Field>

          {/* SUB-TASKS (only for top-level tasks being edited) */}
          {!isCreate && canHaveChildren && (
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
        </div>

        <footer className="border-t border-ink-2 px-4 py-3 flex items-center gap-2">
          {isCreate ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-sm text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draftTitle.trim() || creating}
                onClick={handleCreate}
                className="ml-auto px-3 py-1.5 rounded-md bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-[family-name:var(--font-mono)] transition-colors"
              >
                {creating ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-md border border-danger/40 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleMarkDone}
                className="ml-auto px-3 py-1.5 rounded-md bg-ok/20 border border-ok/40 text-ok hover:bg-ok/30 text-sm font-[family-name:var(--font-mono)] transition-colors"
              >
                ✓ Mark Done
              </button>
            </>
          )}
        </footer>
      </aside>
    </div>
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
