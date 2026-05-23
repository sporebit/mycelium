"use client";

import { useEffect, useRef, useState } from "react";
import type { Entity } from "@/lib/types/task";

export function EntityPicker({
  value,
  valueName,
  onChange,
  onError,
}: {
  value: string | null;
  valueName: string | null;
  onChange: (entity: Entity | null) => void;
  onError?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/entities${query ? `?q=${encodeURIComponent(query)}` : ""}`;
        const res = await fetch(url);
        const j = (await res.json()) as { entities?: Entity[] };
        setResults(Array.isArray(j?.entities) ? j.entities : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(id);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function createEntity(name: string) {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = (await res.json()) as { entity?: Entity; error?: string };
      if (!res.ok || !j.entity) {
        onError?.(j.error ?? "create failed");
        return;
      }
      onChange(j.entity);
      setOpen(false);
      setQuery("");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  const exactMatch = results.find(
    (r) => r.name.trim().toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left rounded-md border border-ink-2 bg-ink-0/40 px-3 py-2 text-sm text-ink-4 hover:border-ink-3 transition-colors"
      >
        {valueName ?? <span className="text-ink-3">No entity</span>}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-ink-2 bg-ink-1 shadow-2xl backdrop-blur-xl max-h-72 overflow-y-auto">
          <div className="p-2 border-b border-ink-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create…"
              className="w-full bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3"
            />
          </div>
          <ul className="py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-ink-3 italic hover:bg-ink-2 transition-colors"
                >
                  Clear selection
                </button>
              </li>
            )}
            {loading ? (
              <li className="px-3 py-2 text-xs text-ink-3 italic">Searching…</li>
            ) : results.length === 0 && !query ? (
              <li className="px-3 py-2 text-xs text-ink-3 italic">
                Type to search
              </li>
            ) : (
              results.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(e);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-ink-2 transition-colors ${
                      e.id === value ? "text-accent" : "text-ink-4"
                    }`}
                  >
                    {e.name}
                    {e.kind && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                        {e.kind}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
            {query.trim() && !exactMatch && (
              <li className="border-t border-ink-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => createEntity(query)}
                  className="w-full text-left px-3 py-1.5 text-sm text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  + Create &quot;{query.trim()}&quot;
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
