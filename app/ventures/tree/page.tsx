"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import type { Venture } from "@/lib/ventures/types";

const VENTURES_KEY = "/api/ventures";

const KIND_ICONS: Record<string, string> = {
  organisation: "🏢",
  business: "💼",
  store: "🏪",
  project: "📂",
  idea: "💡",
};

const STATUS_COLOURS: Record<string, string> = {
  launched: "bg-ok/20 text-ok",
  building: "bg-info/20 text-info",
  exploring: "bg-warn/20 text-warn",
  idea: "bg-ink-3/20 text-ink-3",
  paused: "bg-ink-3/20 text-ink-3",
  closed: "bg-danger/20 text-danger",
};

type TreeVenture = Pick<
  Venture,
  "id" | "name" | "tagline" | "parent_id" | "kind" | "status" | "accent_colour"
>;

function TreeNode({
  venture,
  allVentures,
  onAdd,
}: {
  venture: TreeVenture;
  allVentures: TreeVenture[];
  onAdd: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const kids = allVentures.filter((c) => c.parent_id === venture.id);

  return (
    <div className="ml-4 border-l border-ink-2 pl-4">
      <div className="flex items-center gap-2 py-1.5 group">
        {kids.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-ink-3 hover:text-text-0 text-xs w-4"
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
        {kids.length === 0 && <span className="w-4" />}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: venture.accent_colour }}
        />
        <span className="text-sm mr-1">{KIND_ICONS[venture.kind] ?? "📋"}</span>
        <Link
          href={`/ventures/${venture.id}`}
          className="font-[family-name:var(--font-display)] text-text-0 hover:text-accent transition-colors truncate"
        >
          {venture.name}
        </Link>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] uppercase ${STATUS_COLOURS[venture.status] ?? ""}`}
        >
          {venture.status}
        </span>
        <button
          type="button"
          onClick={() => onAdd(venture.id)}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-[0.1em] transition-opacity ml-auto"
        >
          + ADD CHILD
        </button>
      </div>
      {expanded &&
        kids.map((kid) => (
          <TreeNode
            key={kid.id}
            venture={kid}
            allVentures={allVentures}
            onAdd={onAdd}
          />
        ))}
    </div>
  );
}

export default function VenturesTreePage() {
  const { data } = useApi<{ ventures: Venture[] }>(VENTURES_KEY);
  const ventures = data?.ventures ?? null;

  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    if (!name || !adding) return;
    const parentId = adding;
    setAdding(null);
    setNewName("");

    // Optimistic: prepend a placeholder venture so the tree updates
    // instantly. SWR revalidates after the POST completes; the placeholder
    // is replaced by the real row from the server.
    const optimisticId = `optimistic-${Date.now()}`;
    await mutateApi<{ ventures: Venture[] }>(
      VENTURES_KEY,
      (current) => ({
        ventures: [
          ...(current?.ventures ?? []),
          {
            id: optimisticId,
            name,
            tagline: null,
            parent_id: parentId,
            kind: "idea",
            status: "idea",
            description: null,
            problem: null,
            target_market: null,
            mvp: null,
            revenue_model: null,
            pricing_notes: null,
            cost_estimate_monthly: null,
            cost_estimate_setup: null,
            revenue_projection_monthly: null,
            brand_notes: null,
            competitors: null,
            website_url: null,
            accent_colour: "#84f5b8",
          },
        ],
      }),
      async () => {
        const res = await fetch(VENTURES_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            parent_id: parentId,
            kind: "idea",
            status: "idea",
          }),
        });
        if (!res.ok) throw new Error(`venture create failed (${res.status})`);
      },
    );
  }

  const roots = (ventures ?? []).filter((v) => !v.parent_id);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Venture Tree
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          The full hierarchy at a glance.
        </p>
      </header>

      {ventures === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : roots.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No ventures yet.
        </div>
      ) : (
        <div className="rounded-md bg-ink-1 p-4">
          {roots.map((root) => (
            <TreeNode
              key={root.id}
              venture={root}
              allVentures={ventures}
              onAdd={(parentId) => {
                setAdding(parentId);
                setNewName("");
              }}
            />
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm">
          <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-sm">
            <div className="text-sm text-text-0 font-[family-name:var(--font-display)] mb-3">
              Add child venture
            </div>
            <Mono className="text-[10px] text-ink-3 mb-3">
              Parent: {ventures?.find((v) => v.id === adding)?.name}
            </Mono>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Venture name…"
              className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent mb-3"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(null)}
                className="px-3 py-1.5 text-xs text-ink-3 hover:text-text-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] disabled:opacity-40"
              >
                ADD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
