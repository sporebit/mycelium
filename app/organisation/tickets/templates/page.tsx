"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/data/useApi";
import type { TemplateRow } from "@/lib/tickets/templates";
import { ticketFetch, useProjects } from "@/components/tickets/pickers";

const KEY = "/api/tickets/templates";

/**
 * Templates (spec §9.3): personal + shared, UI-authored and repo-authored.
 * "New from template" fills a ticket and its sub-tasks; the vars box maps
 * `{{key}}` placeholders in the title/body.
 */
export default function TemplatesPage() {
  const router = useRouter();
  const { data, error, mutate } = useApi<{ templates: TemplateRow[] }>(KEY);
  const projects = useProjects();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const templates = data?.templates ?? [];

  async function sync() {
    setBusy("sync");
    setMsg(null);
    try {
      const r = await ticketFetch<{ synced: string[]; skipped: string[] }>(`${KEY}?sync=1`, { method: "POST", body: {} });
      setMsg(`Synced ${r.synced.length} (${r.synced.join(", ") || "none"}); skipped ${r.skipped.length}.`);
      await mutate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function instantiate(t: TemplateRow) {
    const placeholders = Array.from(
      new Set([...(t.definition.title.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g) ?? [])].map((m) => m.replace(/[{}\s]/g, ""))),
    );
    const vars: Record<string, string> = {};
    for (const k of placeholders) {
      const v = prompt(`${t.name}: ${k}?`);
      if (v === null) return;
      vars[k] = v;
    }
    const projectId = projects.length > 0 ? prompt(`Project? (blank = none)\n${projects.map((p) => p.name).join(", ")}`) : "";
    const project = projects.find((p) => p.name.toLowerCase() === (projectId ?? "").trim().toLowerCase());
    setBusy(t.slug);
    try {
      const r = await ticketFetch<{ key: string }>(`${KEY}/${encodeURIComponent(t.slug)}`, {
        method: "POST",
        body: { vars, project_id: project?.id ?? null, category: "next" },
      });
      router.push(`/organisation/tickets/${encodeURIComponent(r.key)}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "create failed");
      setBusy(null);
    }
  }

  async function remove(t: TemplateRow) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setBusy(t.slug);
    try {
      await ticketFetch(`${KEY}/${encodeURIComponent(t.slug)}`, { method: "DELETE" });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">Templates</h1>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => void sync()} disabled={busy === "sync"} className="text-ink-3 hover:text-ink-4">
            Sync repo templates
          </button>
          <Link href="/organisation/tasks" className="text-glow-2 hover:underline">
            ← Tasks
          </Link>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">
        Save any ticket as a template from its page. Repo templates come from docs/tickets/templates.
      </p>
      {msg && <p className="mt-2 text-[11px] text-ink-3">{msg}</p>}

      <div className="mt-4">
        {error ? (
          <p className="text-sm text-ink-3">Could not load templates.</p>
        ) : !data ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
            <p className="text-sm italic text-ink-3">No templates yet. Sync the repo templates to start.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-v2-md border border-hairline bg-surface-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-0">{t.name}</span>
                    <span className="rounded-sm border border-ink-2 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ink-3">{t.kind}</span>
                    <span className="text-[10px] text-ink-3">
                      {t.origin} · v{t.version}
                      {t.shared ? " · shared" : ""}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-ink-3">
                    {t.definition.title}
                    {t.definition.sub_tasks?.length ? ` · ${t.definition.sub_tasks.length} sub-tasks` : ""}
                    {t.definition.steps_definition ? " · steps" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy === t.slug}
                  onClick={() => void instantiate(t)}
                  className="rounded-sm bg-accent/20 px-3 py-1 text-sm text-accent disabled:opacity-40"
                >
                  New from template
                </button>
                <button type="button" onClick={() => void remove(t)} className="text-[11px] text-ink-3 hover:text-danger">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
