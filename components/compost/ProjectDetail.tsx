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
import {
  currencySymbol,
  type Purchase,
  type PurchaseWantOrNeed,
} from "@/lib/types/purchase";

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
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [unlinkedPurchases, setUnlinkedPurchases] = useState<Purchase[]>([]);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [newPurchaseDraft, setNewPurchaseDraft] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
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
    fetch(`/api/purchases?project_id=${project.id}`)
      .then((r) => r.json())
      .then((j: { purchases?: Purchase[] }) => {
        if (!mounted) return;
        setPurchases(Array.isArray(j?.purchases) ? j.purchases : []);
      })
      .catch(() => mounted && setPurchases([]));
    return () => {
      mounted = false;
    };
  }, [project.id]);

  // Re-fetch project (to refresh estimated/actual rollup) whenever the
  // linked purchases list changes. Keeps the budget numbers in sync
  // without bouncing back to the projects index.
  useEffect(() => {
    if (purchases === null) return;
    let mounted = true;
    fetch(`/api/projects/${project.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { project?: Project }) => {
        if (!mounted || !j.project) return;
        // Preserve the local name/desc edit-in-flight state by only
        // overwriting cost fields.
        setProject((cur) => ({
          ...cur,
          estimated_cost: j.project!.estimated_cost,
          actual_cost: j.project!.actual_cost,
          cost_currency: j.project!.cost_currency,
          linked_purchase_count: j.project!.linked_purchase_count,
        }));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [purchases, project.id]);

  async function loadUnlinkedPurchases() {
    try {
      const res = await fetch("/api/purchases?project_id=null", {
        cache: "no-store",
      });
      const j = (await res.json()) as { purchases?: Purchase[] };
      setUnlinkedPurchases(Array.isArray(j?.purchases) ? j.purchases : []);
    } catch {
      setUnlinkedPurchases([]);
    }
  }

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

  async function linkExistingPurchase(p: Purchase) {
    if (linkingId) return;
    setLinkingId(p.id);
    try {
      const res = await fetch(`/api/purchases/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        purchase?: Purchase;
        error?: string;
      };
      if (!res.ok || !j.purchase) {
        setError(j.error ?? "Link failed");
        return;
      }
      setPurchases((cur) => [j.purchase!, ...(cur ?? [])]);
      setUnlinkedPurchases((cur) => cur.filter((x) => x.id !== p.id));
    } finally {
      setLinkingId(null);
    }
  }

  async function createLinkedPurchase() {
    if (linkingId) return;
    const title = newPurchaseDraft.trim();
    if (!title) return;
    setLinkingId("__new__");
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, project_id: project.id }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        purchase?: Purchase;
        error?: string;
      };
      if (!res.ok || !j.purchase) {
        setError(j.error ?? "Create failed");
        return;
      }
      setPurchases((cur) => [j.purchase!, ...(cur ?? [])]);
      setNewPurchaseDraft("");
      setLinkPickerOpen(false);
    } finally {
      setLinkingId(null);
    }
  }

  async function unlinkPurchase(p: Purchase) {
    if (linkingId) return;
    setLinkingId(p.id);
    const prev = purchases ?? [];
    setPurchases((cur) => (cur ?? []).filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/purchases/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: null }),
      });
      if (!res.ok) {
        setPurchases(prev);
        setError("Unlink failed");
      }
    } catch {
      setPurchases(prev);
      setError("Unlink failed");
    } finally {
      setLinkingId(null);
    }
  }

  async function togglePurchaseDone(p: Purchase) {
    const completed_at = p.completed_at ? null : new Date().toISOString();
    const prev = purchases ?? [];
    setPurchases((cur) =>
      (cur ?? []).map((x) => (x.id === p.id ? { ...x, completed_at } : x)),
    );
    try {
      const res = await fetch(`/api/purchases/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at }),
      });
      if (!res.ok) {
        setPurchases(prev);
        setError("Update failed");
      }
    } catch {
      setPurchases(prev);
      setError("Update failed");
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
          href="/organisation/projects"
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
                        href={`/organisation/tasks?focus=${encodeURIComponent(t.id)}`}
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

      <BudgetSection
        project={project}
        purchases={purchases}
        unlinked={unlinkedPurchases}
        linkPickerOpen={linkPickerOpen}
        newPurchaseDraft={newPurchaseDraft}
        linkingId={linkingId}
        onOpenPicker={() => {
          setLinkPickerOpen(true);
          void loadUnlinkedPurchases();
        }}
        onClosePicker={() => {
          setLinkPickerOpen(false);
          setNewPurchaseDraft("");
        }}
        onDraftChange={setNewPurchaseDraft}
        onCreate={() => void createLinkedPurchase()}
        onLinkExisting={(p) => void linkExistingPurchase(p)}
        onUnlink={(p) => void unlinkPurchase(p)}
        onTogglePurchased={(p) => void togglePurchaseDone(p)}
      />
    </div>
  );
}

function wantOrNeedPurchaseTone(v: PurchaseWantOrNeed | null): string {
  if (v === "need") return "bg-danger/15 text-danger border-danger/40";
  if (v === "want") return "bg-accent/15 text-accent border-accent/40";
  return "bg-ink-2 text-ink-3 border-ink-2";
}

function wantOrNeedPurchaseLabel(v: PurchaseWantOrNeed | null): string {
  if (v === "need") return "NEED";
  if (v === "want") return "WANT";
  return "?";
}

function fmtCost(amount: number | undefined, currency: string | undefined): string {
  const v = typeof amount === "number" ? amount : 0;
  const sym = currencySymbol(currency);
  const rounded = Math.round(v);
  return `${sym}${rounded.toLocaleString("en-GB")}`;
}

function fmtPurchaseAmount(p: Purchase): string | null {
  if (p.amount === null || p.amount === undefined) return null;
  return `~${currencySymbol(p.currency)}${
    Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2)
  }`;
}

function BudgetSection({
  project,
  purchases,
  unlinked,
  linkPickerOpen,
  newPurchaseDraft,
  linkingId,
  onOpenPicker,
  onClosePicker,
  onDraftChange,
  onCreate,
  onLinkExisting,
  onUnlink,
  onTogglePurchased,
}: {
  project: Project;
  purchases: Purchase[] | null;
  unlinked: Purchase[];
  linkPickerOpen: boolean;
  newPurchaseDraft: string;
  linkingId: string | null;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onDraftChange: (v: string) => void;
  onCreate: () => void;
  onLinkExisting: (p: Purchase) => void;
  onUnlink: (p: Purchase) => void;
  onTogglePurchased: (p: Purchase) => void;
}) {
  if (purchases === null) {
    return (
      <section className="flex flex-col gap-2 mt-2">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Budget
        </h2>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading purchases…
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 mt-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Budget
        </h2>
        {!linkPickerOpen && (
          <button
            type="button"
            onClick={onOpenPicker}
            className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
          >
            + Link purchase
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="bg-ink-1 rounded-md px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Estimated
          </div>
          <Mono className="text-2xl text-text-0 tabular-nums mt-1 block">
            {fmtCost(project.estimated_cost, project.cost_currency)}
          </Mono>
        </div>
        <div className="bg-ink-1 rounded-md px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Actual
          </div>
          <Mono className="text-2xl text-text-0 tabular-nums mt-1 block">
            {fmtCost(project.actual_cost, project.cost_currency)}
          </Mono>
        </div>
      </div>

      {linkPickerOpen && (
        <div className="bg-ink-1 rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Link a purchase
            </span>
            <button
              type="button"
              onClick={onClosePicker}
              className="text-ink-3 hover:text-ink-4 text-sm"
              aria-label="Close picker"
            >
              ×
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
            className="flex items-center gap-2 bg-ink-0/40 border border-ink-2 rounded-md px-3 py-2"
          >
            <span aria-hidden className="text-accent text-sm">
              🛍
            </span>
            <input
              type="text"
              value={newPurchaseDraft}
              onChange={(e) => onDraftChange(e.target.value)}
              disabled={linkingId === "__new__"}
              placeholder="Create a new purchase linked to this project"
              className="flex-1 bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
            />
            <button
              type="submit"
              disabled={!newPurchaseDraft.trim() || linkingId === "__new__"}
              className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
            >
              {linkingId === "__new__" ? "…" : "CREATE ↵"}
            </button>
          </form>

          {unlinked.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Or link an existing purchase
              </span>
              <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {unlinked.slice(0, 50).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onLinkExisting(p)}
                      disabled={linkingId === p.id}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-ink-2/40 text-sm text-text-0 disabled:opacity-40"
                    >
                      <span className="flex-1 truncate">{p.title}</span>
                      {fmtPurchaseAmount(p) && (
                        <Mono className="text-[11px] text-ink-3 shrink-0">
                          {fmtPurchaseAmount(p)}
                        </Mono>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {purchases.length === 0 ? (
        !linkPickerOpen && (
          <div className="rounded-md bg-ink-1 p-8 text-center">
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              No purchases linked to this project yet.
            </p>
            <button
              type="button"
              onClick={onOpenPicker}
              className="mt-3 inline-flex items-center px-3 py-2 rounded-md border border-accent/40 bg-accent/15 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
            >
              + Link purchase
            </button>
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {purchases.map((p) => {
            const purchased = !!p.completed_at;
            const amount = fmtPurchaseAmount(p);
            return (
              <li
                key={p.id}
                className={`group flex items-center gap-3 bg-ink-1 rounded-md px-3 py-2.5 ${
                  purchased ? "opacity-60" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onTogglePurchased(p)}
                  aria-label={
                    purchased
                      ? "Mark as not purchased"
                      : "Mark as purchased"
                  }
                  className={`h-5 w-5 shrink-0 rounded-sm border flex items-center justify-center text-[11px] leading-none transition-colors ${
                    purchased
                      ? "border-ok bg-ok text-ink-0"
                      : "border-ink-3 hover:border-accent"
                  }`}
                >
                  {purchased ? "✓" : ""}
                </button>
                <span
                  className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${wantOrNeedPurchaseTone(p.want_or_need)}`}
                >
                  {wantOrNeedPurchaseLabel(p.want_or_need)}
                </span>
                <Link
                  href={`/organisation/purchases?project=${project.id}`}
                  className={`flex-1 min-w-0 text-sm hover:text-accent transition-colors truncate ${
                    purchased ? "text-ink-3 line-through" : "text-text-0"
                  }`}
                >
                  {p.title}
                </Link>
                {amount && (
                  <Mono className="text-[11px] text-ink-3 shrink-0 tabular-nums">
                    {amount}
                  </Mono>
                )}
                <button
                  type="button"
                  onClick={() => onUnlink(p)}
                  disabled={linkingId === p.id}
                  aria-label="Unlink from project"
                  title="Unlink from project"
                  className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger transition-opacity text-sm shrink-0"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
