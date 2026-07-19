"use client";

import { useMemo } from "react";
import Link from "next/link";
import { RECIPES_INPUT_CLS, type Recipe } from "@/lib/health/recipes";

export function RecipeGrid({
  recipes,
  search,
  setSearch,
  tagFilter,
  setTagFilter,
}: {
  recipes: Recipe[];
  search: string;
  setSearch: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
}) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) for (const t of r.tags) set.add(t);
    return Array.from(set).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (tagFilter !== "all" && !r.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          (r.cuisine?.toLowerCase().includes(q) ?? false) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [recipes, search, tagFilter]);

  return (
    <>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search recipes…"
        className={`${RECIPES_INPUT_CLS} mb-3`}
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          <button
            onClick={() => setTagFilter("all")}
            className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${
              tagFilter === "all" ? "border-accent bg-accent/10 text-accent" : "border-ink-2 text-ink-3"
            }`}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? "all" : t)}
              className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${
                tagFilter === t ? "border-[#5de8e0] bg-[#5de8e0]/10 text-[#5de8e0]" : "border-ink-2 text-ink-3"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
          No recipes yet. Add your first one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/health/recipes/${r.id}`}
              className="group rounded-xl border border-ink-2 overflow-hidden hover:border-ink-3 transition-colors"
            >
              <div
                className="h-36 w-full bg-cover bg-center"
                style={
                  r.image_url
                    ? { backgroundImage: `url(${r.image_url})` }
                    : { background: "linear-gradient(135deg, #5de8e0 0%, #3bb8b0 100%)" }
                }
              />
              <div className="p-3">
                <p className="text-sm text-ink-4 font-[family-name:var(--font-display)] group-hover:text-text-0 transition-colors truncate">
                  {r.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                  {r.cuisine && <span>{r.cuisine}</span>}
                  {r.prep_time_minutes != null && <span>{r.prep_time_minutes}m prep</span>}
                  {r.cook_time_minutes != null && <span>{r.cook_time_minutes}m cook</span>}
                  <span>{r.servings} servings</span>
                </div>
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.tags.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded-full bg-[#5de8e0]/10 text-[#5de8e0] text-[9px] font-[family-name:var(--font-mono)]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
