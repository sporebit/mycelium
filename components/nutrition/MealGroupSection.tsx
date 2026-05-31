"use client";

import { useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type { MealGroup, NutritionLog } from "@/lib/nutrition/types-v2";

export function MealGroupSection({
  group,
  logs,
  onAdd,
  onDelete,
  onChangeQuantity,
  onRename,
  onDeleteGroup,
}: {
  group: MealGroup | null; // null = "Unassigned"
  logs: NutritionLog[];
  onAdd: (groupId: string | null) => void;
  onDelete: (logId: string) => void;
  onChangeQuantity: (logId: string, quantityG: number) => void;
  onRename?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group?.name ?? "");

  const total = logs.reduce((s, l) => s + (l.kcal ?? 0), 0);
  const groupName = group?.name ?? "Unassigned";
  const groupId = group?.id ?? null;

  return (
    <section className="rounded-md bg-ink-1 border border-ink-2 overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-ink-2/40 border-b border-ink-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <span aria-hidden className="text-ink-3 text-[10px]">
            {collapsed ? "▶" : "▼"}
          </span>
          {editingName && group ? (
            <input
              autoFocus
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                setEditingName(false);
                const v = nameDraft.trim();
                if (v && v !== group.name) onRename?.(group.id, v);
                else setNameDraft(group.name);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "Escape") {
                  setNameDraft(group.name);
                  setEditingName(false);
                }
              }}
              className="bg-ink-2 px-1.5 py-0.5 rounded-sm text-[11px] text-text-0 font-[family-name:var(--font-mono)] tracking-[0.18em] outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                if (!group || !onRename) return;
                e.stopPropagation();
                setEditingName(true);
              }}
              className="text-[11px] uppercase tracking-[0.18em] text-ink-4 font-[family-name:var(--font-mono)]"
            >
              {groupName}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          <Mono className="text-[11px] text-ink-3 tabular-nums">
            {Math.round(total)} kcal
          </Mono>
          {group && onDeleteGroup && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${group.name}"? Logged entries will be kept (just unassigned).`,
                  )
                ) {
                  onDeleteGroup(group.id);
                }
              }}
              aria-label="Delete meal group"
              title="Delete meal group"
              className="text-ink-3 hover:text-danger transition-colors text-base"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className="flex flex-col">
          {logs.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] text-center">
              Nothing logged here yet.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-2/60">
              {logs.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  onDelete={() => onDelete(log.id)}
                  onChangeQuantity={(q) => onChangeQuantity(log.id, q)}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onAdd(groupId)}
            className="px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10 text-left font-[family-name:var(--font-mono)] border-t border-ink-2/60"
          >
            + Add food
          </button>
        </div>
      )}
    </section>
  );
}

function LogRow({
  log,
  onDelete,
  onChangeQuantity,
}: {
  log: NutritionLog;
  onDelete: () => void;
  onChangeQuantity: (quantity: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.quantity_g);

  function commit() {
    setEditing(false);
    if (draft > 0 && draft !== log.quantity_g) onChangeQuantity(draft);
    else setDraft(log.quantity_g);
  }

  return (
    <li className="group flex items-center gap-2 px-3 py-2 hover:bg-ink-2/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-4 truncate">
          {log.food_name}
          {log.brand && (
            <span className="text-ink-3 text-xs ml-1.5">· {log.brand}</span>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5 flex items-center gap-2">
          {editing ? (
            <input
              autoFocus
              type="number"
              min={1}
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value) || 0)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "Escape") {
                  setDraft(log.quantity_g);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-16 bg-ink-2 px-1.5 py-0.5 rounded-sm text-text-0 text-[11px] font-[family-name:var(--font-mono)] outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="hover:text-ink-4 transition-colors"
              title="Tap to edit quantity"
            >
              {log.serving_label ? `${log.serving_label} · ` : ""}
              {log.quantity_g}g
            </button>
          )}
          <span>·</span>
          <span>P {Math.round(log.protein_g ?? 0)}g</span>
          <span>C {Math.round(log.carbs_g ?? 0)}g</span>
          <span>F {Math.round(log.fat_g ?? 0)}g</span>
        </div>
      </div>
      <div className="text-right">
        <Mono className="text-sm text-ink-4 tabular-nums">
          {Math.round(log.kcal ?? 0)}
        </Mono>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger transition-opacity text-sm"
      >
        ×
      </button>
    </li>
  );
}
