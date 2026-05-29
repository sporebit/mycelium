"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";
import { URGENCIES, URGENCY_LABEL, type Task, type TaskUrgency } from "@/lib/types/task";

type Props = {
  initialProject: Project;
};

const URGENCY_TONE: Record<TaskUrgency, string> = {
  today: "bg-danger/15 text-danger border-danger/40",
  this_week: "bg-warn/15 text-warn border-warn/40",
  this_month: "bg-accent/15 text-accent border-accent/40",
  someday: "bg-ink-2 text-ink-3 border-ink-2",
};

export function ProjectDetail({ initialProject }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialProject.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initialProject.description ?? "");
  const [addDraft, setAddDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/tasks?status=open&project_id=${project.id}`)
      .then((r) => r.json())
      .then((j: { tasks?: Task[] }) => {
        if (!mounted) return;
        setTasks(Array.isArray(j?.tasks) ? j.tasks : []);
      })
      .catch(() => mounted && setTasks([]));
    return () => {
      mounted = false;
    };
  }, [project.id]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function patchProject(patch: Partial<Project>) {
    const prev = project;
    setProject({ ...project, ...patch });
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { project?: Project; error?: string };
      if (!res.ok || !j.project) {
        setProject(prev);
        setError(j.error ?? "Update failed");
        return;
      }
      setProject(j.project);
    } catch (err) {
      setProject(prev);
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function saveName() {
    setEditingName(false);
    const v = nameDraft.trim();
    if (!v || v === project.name) {
      setNameDraft(project.name);
      return;
    }
    await patchProject({ name: v });
  }

  async function saveDesc() {
    setEditingDesc(false);
    const v = descDraft;
    if (v === (project.description ?? "")) return;
    await patchProject({ description: v.trim() || null });
  }

  async function addTask() {
    if (adding) return;
    const title = addDraft.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, project_id: project.id }),
      });
      const j = (await res.json()) as { task?: Task; error?: string };
      if (!res.ok || !j.task) {
        setError(j.error ?? "Create failed");
        return;
      }
      setTasks((cur) => [j.task!, ...(cur ?? [])]);
      setAddDraft("");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTaskDone(t: Task) {
    const completed_at = t.completed_at ? null : new Date().toISOString();
    setTasks((cur) =>
      (cur ?? []).map((x) => (x.id === t.id ? { ...x, completed_at } : x)),
    );
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at }),
      });
      if (!res.ok) {
        setTasks((cur) =>
          (cur ?? []).map((x) =>
            x.id === t.id ? { ...x, completed_at: t.completed_at } : x,
          ),
        );
        setError("Update failed");
      } else if (completed_at) {
        // remove from the open list
        setTasks((cur) => (cur ?? []).filter((x) => x.id !== t.id));
      }
    } catch {
      setTasks((cur) =>
        (cur ?? []).map((x) =>
          x.id === t.id ? { ...x, completed_at: t.completed_at } : x,
        ),
      );
    }
  }

  const grouped = useMemo(() => {
    const buckets: Record<TaskUrgency, Task[]> = {
      today: [],
      this_week: [],
      this_month: [],
      someday: [],
    };
    for (const t of tasks ?? []) {
      const u = (t.urgency ?? "someday") as TaskUrgency;
      buckets[u].push(t);
    }
    return buckets;
  }, [tasks]);

  const statusToneClass =
    project.status === "active"
      ? "bg-accent/15 text-accent border-accent/40"
      : project.status === "completed"
        ? "bg-ok/15 text-ok border-ok/40"
        : "bg-ink-2 text-ink-3 border-ink-2";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/compost/projects"
          className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] inline-flex items-center gap-1"
        >
          ← PROJECTS
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {project.colour && (
            <span
              aria-hidden
              style={{ backgroundColor: project.colour }}
              className="h-4 w-4 rounded-full shrink-0"
            />
          )}
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveName();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setNameDraft(project.name);
                  setEditingName(false);
                }
              }}
              className="font-[family-name:var(--font-display)] italic text-2xl text-text-0 bg-transparent border-b border-accent outline-none flex-1 pb-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(project.name);
                setEditingName(true);
              }}
              className="font-[family-name:var(--font-display)] italic text-2xl text-text-0 text-left flex-1 hover:opacity-80"
            >
              {project.name}
            </button>
          )}
          <select
            value={project.status}
            onChange={(e) =>
              void patchProject({ status: e.target.value as ProjectStatus })
            }
            className={`text-[11px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1 rounded-md border ${statusToneClass}`}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {editingDesc ? (
          <textarea
            autoFocus
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => void saveDesc()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setDescDraft(project.description ?? "");
                setEditingDesc(false);
              }
            }}
            rows={3}
            placeholder="Project description…"
            className="bg-ink-1 rounded-md text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-glow-2 resize-y"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDescDraft(project.description ?? "");
              setEditingDesc(true);
            }}
            className="bg-ink-1 rounded-md text-sm text-left whitespace-pre-wrap px-3 py-2 min-h-[44px] hover:bg-ink-2/30 transition-colors text-text-1"
          >
            {project.description || (
              <span className="text-ink-3 italic">Click to add description…</span>
            )}
          </button>
        )}
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addTask();
        }}
        className="flex items-center gap-2 bg-ink-1 rounded-md px-3 py-2"
      >
        <span className="text-accent text-sm">+</span>
        <input
          type="text"
          value={addDraft}
          onChange={(e) => setAddDraft(e.target.value)}
          disabled={adding}
          placeholder="Add a task to this project"
          className="flex-1 bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={!addDraft.trim() || adding}
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
        >
          {adding ? "…" : "ADD ↵"}
        </button>
      </form>

      {tasks === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading tasks…
        </div>
      ) : (tasks ?? []).length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No tasks in this project yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {URGENCIES.map((u) => {
            const list = grouped[u];
            if (list.length === 0) return null;
            return (
              <section key={u} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {URGENCY_LABEL[u]}
                  </span>
                  <Mono className="text-[10px] text-ink-3">
                    {list.length}
                  </Mono>
                </div>
                <ul className="flex flex-col">
                  {list.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 py-2 border-b border-ink-2 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleTaskDone(t)}
                        aria-label="Mark done"
                        className="h-4 w-4 shrink-0 rounded-sm border border-ink-3 hover:border-accent flex items-center justify-center text-[10px] leading-none transition-colors"
                      />
                      <Link
                        href={`/compost/tasks?focus=${encodeURIComponent(t.id)}`}
                        onClick={() => router.refresh()}
                        className="flex-1 min-w-0 text-sm text-text-0 hover:text-accent transition-colors truncate"
                      >
                        {t.title}
                        {t.key && (
                          <span className="ml-2 text-[10px] text-danger font-[family-name:var(--font-mono)]">
                            ★
                          </span>
                        )}
                      </Link>
                      {t.urgency && (
                        <span
                          className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${URGENCY_TONE[t.urgency]}`}
                        >
                          {URGENCY_LABEL[t.urgency]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
