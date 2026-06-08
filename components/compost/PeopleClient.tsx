"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { PersonDrawer } from "./PersonDrawer";
import { ReviewQueue } from "./ReviewQueue";
import { triggerGlowPulse } from "@/lib/motion";
import type { PersonWithAliases } from "@/lib/people/types";

type Filter = "all" | "recent" | "review";

function relativeDate(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.floor(d)}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function displayName(p: PersonWithAliases): string {
  if (p.display_name) return p.display_name;
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

function initialsOf(p: PersonWithAliases): string {
  const name = displayName(p);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = [
    "bg-glow-3 text-glow-1",
    "bg-warn/20 text-warn",
    "bg-info/20 text-info",
    "bg-ink-3 text-text-1",
  ];
  return palette[h % palette.length];
}

export function PeopleClient() {
  const [people, setPeople] = useState<PersonWithAliases[] | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [relationship, setRelationship] = useState<string>("all");
  const [drawerMode, setDrawerMode] = useState<
    { kind: "create" } | { kind: "edit"; person: PersonWithAliases } | null
  >(null);

  const load = async () => {
    try {
      const r = await fetch("/api/people", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as {
        people: PersonWithAliases[];
        review_count: number;
      };
      setPeople(j.people ?? []);
      setReviewCount(j.review_count ?? 0);
    } catch {
      setPeople([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/people", { cache: "no-store" });
        if (!r.ok || !mounted) return;
        const j = (await r.json()) as {
          people: PersonWithAliases[];
          review_count: number;
        };
        if (!mounted) return;
        setPeople(j.people ?? []);
        setReviewCount(j.review_count ?? 0);
      } catch {
        if (mounted) setPeople([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const relationships = useMemo(() => {
    const s = new Set<string>();
    for (const p of people ?? []) if (p.relationship) s.add(p.relationship);
    return Array.from(s).sort();
  }, [people]);

  const visible = useMemo(() => {
    let list = people ?? [];
    if (filter === "recent") {
      list = [...list].sort((a, b) =>
        (b.last_mention_at ?? "").localeCompare(a.last_mention_at ?? "")
      );
    } else if (filter === "review") {
      list = list.filter((p) => p.needs_review);
    }
    if (relationship !== "all") {
      list = list.filter((p) => p.relationship === relationship);
    }
    return list;
  }, [people, filter, relationship]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <div className="card-eyebrow">People</div>
          <div className="flex items-baseline gap-3">
            <span className="font-[family-name:var(--font-display)] text-2xl text-text-0">
              {people === null
                ? "…"
                : `${people.length} ${people.length === 1 ? "person" : "people"}`}
            </span>
            {reviewCount > 0 && (
              <span className="text-xs text-warn">
                {reviewCount} {reviewCount === 1 ? "needs" : "need"} review
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/organisation/people/import-setup"
            className="px-3 py-2 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em]"
          >
            IMPORT
          </Link>
          <button
            type="button"
            onClick={(e) => {
              triggerGlowPulse(e.currentTarget);
              setDrawerMode({ kind: "create" });
            }}
            className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 transition-colors text-xs font-medium font-[family-name:var(--font-mono)] tracking-[0.1em]"
          >
            + ADD PERSON
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: "ALL" },
            { id: "recent", label: "RECENT" },
            { id: "review", label: "REVIEW NEEDED" },
          ] as Array<{ id: Filter; label: string }>
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border transition-colors ${
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
              }`}
            >
              {f.label}
              {f.id === "review" && reviewCount > 0 && (
                <span className="ml-1.5 text-warn">({reviewCount})</span>
              )}
            </button>
          );
        })}
        {relationships.length > 0 && (
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="ml-2 bg-ink-2 rounded-sm text-[11px] text-text-1 px-3 py-1.5 outline outline-1 outline-transparent focus:outline-glow-2 font-[family-name:var(--font-mono)] tracking-[0.1em]"
          >
            <option value="all">ALL RELATIONSHIPS</option>
            {relationships.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>
        )}
      </div>

      {filter === "review" ? (
        <ReviewQueue onResolved={() => void load()} />
      ) : people === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          {(people?.length ?? 0) === 0
            ? "No people yet. Add one above, or mention someone in a capture — Mycelium will auto-create them here."
            : "No people match these filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/organisation/people/${p.id}`}
              className="growth-in rounded-md bg-ink-1 hover:bg-ink-2 transition-colors p-4 flex items-start gap-3"
            >
              <span
                className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-[family-name:var(--font-display)] ${avatarColor(displayName(p))}`}
              >
                {initialsOf(p)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-display)] text-xl text-text-0 truncate">
                    {displayName(p)}
                  </span>
                  {p.needs_review && (
                    <span className="text-[10px] uppercase tracking-[0.15em] text-warn font-[family-name:var(--font-mono)]">
                      ⚠ review
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-2 font-[family-name:var(--font-mono)] tracking-[0.08em] mt-0.5">
                  {p.relationship ? `${p.relationship} · ` : ""}
                  {p.mention_count
                    ? `${p.mention_count} mention${p.mention_count === 1 ? "" : "s"} · `
                    : ""}
                  {p.last_mention_at
                    ? `last ${relativeDate(p.last_mention_at)}`
                    : "no mentions"}
                </div>
                {p.aliases.length > 1 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.aliases.slice(1, 4).map((a) => (
                      <Mono
                        key={a.id}
                        className="text-[10px] text-text-2 bg-ink-2/60 px-1.5 py-0.5 rounded-sm"
                      >
                        {a.alias}
                      </Mono>
                    ))}
                    {p.aliases.length > 4 && (
                      <Mono className="text-[10px] text-text-2">
                        +{p.aliases.length - 4}
                      </Mono>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {drawerMode && (
        <PersonDrawer
          mode={drawerMode}
          onClose={() => setDrawerMode(null)}
          onSaved={() => {
            setDrawerMode(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
