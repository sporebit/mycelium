"use client";

import { useState } from "react";
import Link from "next/link";
import { Surface, Sheet, Button, Label } from "@/components/ui";
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

const STATUS_CHIP =
  "px-1.5 py-0.5 rounded-v2-sm text-[9px] uppercase tracking-[0.1em] font-[family-name:var(--font-jetbrains-mono)]";

const STATUS_TONE: Record<string, string> = {
  launched: "bg-glow-wash text-glow",
  building: "bg-surface-2 text-text-hi",
  exploring: "bg-surface-2 text-v2-warn",
  idea: "bg-surface-2 text-text-lo",
  paused: "bg-surface-2 text-text-lo",
  closed: "bg-surface-2 text-v2-error",
};

type TreeVenture = Pick<
  Venture,
  "id" | "name" | "tagline" | "parent_id" | "kind" | "status" | "accent_colour"
>;

function TreeNode({
  venture,
  allVentures,
  onAdd,
  depth,
}: {
  venture: TreeVenture;
  allVentures: TreeVenture[];
  onAdd: (parentId: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const kids = allVentures.filter((c) => c.parent_id === venture.id);
  // Cap Surface level at 3 per spec; depth 0 is root row.
  const level = Math.min(depth + 1, 3) as 1 | 2 | 3;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-hairline pl-3" : ""}>
      <Surface
        level={level}
        interactive
        className="flex items-center gap-2 px-3 py-2 mt-1 group"
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-text-lo hover:text-text-hi text-xs w-4 shrink-0"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: venture.accent_colour }}
          aria-hidden
        />
        <span className="text-sm shrink-0" aria-hidden>
          {KIND_ICONS[venture.kind] ?? "📋"}
        </span>
        <Link
          href={`/ventures/${venture.id}`}
          className="text-sm text-text-hi hover:text-glow transition-colors truncate min-w-0 flex-1"
        >
          {venture.name}
        </Link>
        <span
          className={`shrink-0 ${STATUS_CHIP} ${STATUS_TONE[venture.status] ?? "bg-surface-2 text-text-lo"}`}
        >
          {venture.status}
        </span>
        <button
          type="button"
          onClick={() => onAdd(venture.id)}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-text-lo hover:text-glow font-[family-name:var(--font-jetbrains-mono)] tracking-[0.1em] transition-opacity"
        >
          + child
        </button>
      </Surface>
      {expanded &&
        kids.map((kid) => (
          <TreeNode
            key={kid.id}
            venture={kid}
            allVentures={allVentures}
            onAdd={onAdd}
            depth={depth + 1}
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
  const parentName = ventures?.find((v) => v.id === adding)?.name ?? "";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-text-hi tracking-[-0.02em] leading-[1.15]">
          Venture Tree
        </h1>
        <p className="text-sm text-text-mid">
          The full hierarchy at a glance.
        </p>
      </header>

      {ventures === null ? (
        <div className="text-sm text-text-lo italic py-12 text-center">
          Loading…
        </div>
      ) : roots.length === 0 ? (
        <div className="text-sm text-text-lo italic py-12 text-center">
          No ventures yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {roots.map((root) => (
            <TreeNode
              key={root.id}
              venture={root}
              allVentures={ventures}
              onAdd={(parentId) => {
                setAdding(parentId);
                setNewName("");
              }}
              depth={0}
            />
          ))}
        </div>
      )}

      <Sheet
        open={!!adding}
        onClose={() => {
          setAdding(null);
          setNewName("");
        }}
        title="Add child venture"
      >
        <Label>Parent</Label>
        <div className="text-sm text-text-hi mt-1 mb-4">{parentName}</div>
        <Label>Name</Label>
        <input
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Venture name…"
          className="w-full mt-1 bg-surface-0 border border-hairline rounded-v2-sm text-sm text-text-hi px-3 py-2 outline-none focus:border-glow"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(null);
              setNewName("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim()}
          >
            Add
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
