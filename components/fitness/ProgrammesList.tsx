"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import type { Programme } from "@/lib/fitness/types";

type Toast = { kind: "success" | "error"; text: string } | null;

export function ProgrammesList() {
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  async function load(archived: boolean) {
    const url = archived
      ? "/api/fitness/programmes?include_archived=true"
      : "/api/fitness/programmes";
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { programmes?: Programme[] };
      setProgrammes(Array.isArray(j.programmes) ? j.programmes : []);
    } else {
      setProgrammes([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    const url = showArchived
      ? "/api/fitness/programmes?include_archived=true"
      : "/api/fitness/programmes";
    (async () => {
      const res = await fetch(url, { cache: "no-store" });
      if (!mounted) return;
      if (res.ok) {
        const j = (await res.json()) as { programmes?: Programme[] };
        if (mounted) setProgrammes(Array.isArray(j.programmes) ? j.programmes : []);
      } else if (mounted) {
        setProgrammes([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [showArchived]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  async function archive(p: Programme) {
    setProgrammes((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
    await fetch(`/api/fitness/programmes/${p.id}/archive`, { method: "POST" });
    void load(showArchived);
  }

  async function unarchive(p: Programme) {
    await fetch(`/api/fitness/programmes/${p.id}/unarchive`, { method: "POST" });
    void load(showArchived);
  }

  async function runSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/fitness/seed", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", text: j.error ?? "Seed failed" });
      } else if (j.skipped) {
        setToast({ kind: "success", text: "Already seeded" });
      } else {
        setToast({
          kind: "success",
          text: `Seeded ${j.sessions_created} sessions · ${j.exercises_created} exercises`,
        });
        await load(showArchived);
      }
    } catch (err) {
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Seed error" });
    } finally {
      setSeeding(false);
    }
  }

  async function createNew() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/fitness/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", text: j.error ?? "Create failed" });
        return;
      }
      setNewName("");
      await load(showArchived);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
          Programmes
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
              showArchived
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            {showArchived ? "HIDE ARCHIVED" : "SHOW ARCHIVED"}
          </button>
          <button
            type="button"
            onClick={runSeed}
            disabled={seeding}
            className="px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {seeding ? "SEEDING…" : "SEED"}
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createNew();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New programme name…"
          className="flex-1 max-w-md bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 placeholder:text-ink-3 px-3 py-1.5 outline-none focus:border-ink-3"
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          + NEW
        </button>
      </form>

      {programmes === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
          Loading…
        </div>
      ) : programmes.length === 0 ? (
        <Panel title="Empty">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No programmes yet. Seed Phil&apos;s rehab programme above, or create a
            new one.
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {programmes.map((p) => {
            const isArchived = !!p.archived_at;
            return (
              <div key={p.id} className={`group relative ${isArchived ? "opacity-50" : ""}`}>
                {isArchived ? (
                  <button
                    type="button"
                    onClick={() => unarchive(p)}
                    className="absolute top-2 right-2 h-6 px-2 rounded-full flex items-center justify-center text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-accent hover:bg-accent/15 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    UNARCHIVE
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => archive(p)}
                    aria-label={`Archive ${p.name}`}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-ink-3 hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2l-8 8" />
                    </svg>
                  </button>
                )}
                <Panel
                  title={p.name}
                  bottomCTA={
                    <Link
                      href={`/fitness/programmes/${p.id}/edit`}
                      className="hover:text-ink-4 transition-colors"
                    >
                      EDIT →
                    </Link>
                  }
                >
                  {p.description && (
                    <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Created <Mono>{p.created_at.slice(0, 10)}</Mono>
                  </div>
                </Panel>
              </div>
            );
          })}
        </div>
      )}

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
