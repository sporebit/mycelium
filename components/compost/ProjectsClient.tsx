"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import {
  PROJECT_STATUS_LABEL,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";

type Filter = ProjectStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "ACTIVE" },
  { value: "archived", label: "ARCHIVED" },
  { value: "completed", label: "COMPLETED" },
  { value: "all", label: "ALL" },
];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function statusToneClass(s: ProjectStatus): string {
  if (s === "active") return "bg-accent/15 text-accent border-accent/40";
  if (s === "completed") return "bg-ok/15 text-ok border-ok/40";
  return "bg-ink-2 text-ink-3 border-ink-2";
}

export function ProjectsClient() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", colour: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: { projects?: Project[] }) => {
        if (!mounted) return;
        setProjects(Array.isArray(j?.projects) ? j.projects : []);
      })
      .catch(() => mounted && setProjects([]));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  const visible = useMemo(() => {
    if (!projects) return [];
    if (filter === "all") return projects;
    return projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  async function createProject() {
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: draft.description.trim() || null,
          colour: draft.colour.trim() || null,
        }),
      });
      const j = (await res.json()) as { project?: Project; error?: string };
      if (!res.ok || !j.project) {
        setError(j.error ?? "Create failed");
        return;
      }
      setProjects((cur) => [j.project!, ...(cur ?? [])]);
      setDraft({ name: "", description: "", colour: "" });
      setShowNew(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-md border border-ink-2 overflow-hidden">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          {showNew ? "× CANCEL" : "+ NEW PROJECT"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {showNew && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createProject();
          }}
          className="rounded-md bg-ink-1 p-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Name
            </span>
            <input
              autoFocus
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Project name"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Description (optional)
            </span>
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={2}
              placeholder="What's this project for?"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 resize-y"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Colour (optional hex)
            </span>
            <input
              type="text"
              value={draft.colour}
              onChange={(e) =>
                setDraft((d) => ({ ...d, colour: e.target.value }))
              }
              placeholder="#7dd3fc"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 max-w-[160px]"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="px-4 py-2 rounded-sm border border-ink-4 text-sm text-text-1 hover:text-text-0 hover:bg-ink-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !draft.name.trim()}
              className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {projects === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading projects…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {filter === "all"
              ? "No projects yet."
              : `No ${PROJECT_STATUS_LABEL[filter as ProjectStatus].toLowerCase()} projects.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <li key={p.id}>
              <Link
                href={`/compost/projects/${p.id}`}
                className="block bg-ink-1 rounded-md p-4 hover:bg-ink-2/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {p.colour && (
                    <span
                      aria-hidden
                      style={{ backgroundColor: p.colour }}
                      className="h-3 w-3 rounded-full shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-text-0 truncate">
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-xs text-ink-3 truncate mt-0.5">
                        {p.description}
                      </div>
                    )}
                  </div>
                  <Mono className="text-[11px] text-ink-3 shrink-0">
                    {p.task_count ?? 0} {p.task_count === 1 ? "task" : "tasks"}
                  </Mono>
                  <span
                    className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${statusToneClass(p.status)}`}
                  >
                    {PROJECT_STATUS_LABEL[p.status]}
                  </span>
                  <Mono className="text-[10px] text-ink-3 shrink-0 hidden sm:block">
                    {fmtDate(p.created_at)}
                  </Mono>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
