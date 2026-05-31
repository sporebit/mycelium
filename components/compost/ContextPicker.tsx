"use client";

import { useEffect, useRef, useState } from "react";
import type { ContextField, ContextOption } from "@/lib/types/context";

/**
 * Searchable dropdown for one of the three context-options fields
 * (where / device / context_tag). Includes "+ Add new" at the bottom
 * which POSTs to /api/context-options and selects the freshly created
 * option.
 */
export function ContextPicker({
  field,
  options,
  value,
  onChange,
  onCreated,
  placeholder,
  compact,
}: {
  field: ContextField;
  options: ContextOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  onCreated: (option: ContextOption) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creatingLabel, setCreatingLabel] = useState("");
  const [creatingIcon, setCreatingIcon] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? null;
  const filtered = query
    ? options.filter((o) =>
        `${o.label} ${o.value}`.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  async function createOption() {
    const label = creatingLabel.trim();
    if (!label || creating) return;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setCreating(true);
    try {
      const r = await fetch("/api/context-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          value,
          label,
          icon: creatingIcon.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { option?: ContextOption };
      if (!r.ok || !j.option) return;
      onCreated(j.option);
      onChange(j.option.value);
      setCreatingLabel("");
      setCreatingIcon("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  const triggerCls = compact
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-1 text-[11px]";

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${triggerCls} rounded-md border border-ink-2 bg-ink-0/40 hover:border-ink-3 text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.12em] inline-flex items-center gap-1 transition-colors`}
      >
        {current ? (
          <>
            {current.icon && <span aria-hidden>{current.icon}</span>}
            <span className="truncate max-w-[10rem]">{current.label}</span>
          </>
        ) : (
          <span className="text-ink-3 italic">{placeholder ?? "Any"}</span>
        )}
        <span aria-hidden className="text-ink-3">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 max-h-[60vh] overflow-y-auto rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-2 flex flex-col gap-1">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
          />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="text-left text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 px-2 py-1 font-[family-name:var(--font-mono)]"
          >
            — Any —
          </button>
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`text-left text-sm px-2 py-1.5 rounded-sm flex items-center gap-2 hover:bg-ink-2/60 transition-colors ${
                o.value === value ? "ring-1 ring-glow-2/40 bg-ink-2/30" : ""
              }`}
            >
              {o.icon && <span aria-hidden>{o.icon}</span>}
              <span className="text-ink-4">{o.label}</span>
            </button>
          ))}
          <div className="border-t border-ink-2/60 mt-1 pt-2 flex flex-col gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              + Add new
            </span>
            <input
              type="text"
              value={creatingLabel}
              onChange={(e) => setCreatingLabel(e.target.value)}
              placeholder="Label"
              className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={creatingIcon}
                onChange={(e) => setCreatingIcon(e.target.value)}
                placeholder="Icon (emoji)"
                maxLength={3}
                className="w-20 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
              <button
                type="button"
                onClick={createOption}
                disabled={!creatingLabel.trim() || creating}
                className="flex-1 px-2 py-1 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                {creating ? "…" : "ADD"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
