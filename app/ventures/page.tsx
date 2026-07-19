"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { useApi } from "@/lib/data/useApi";
import type { Venture } from "@/lib/ventures/types";

const STATUS_COLOURS: Record<string, string> = {
  launched: "bg-ok/20 text-ok",
  building: "bg-info/20 text-info",
  exploring: "bg-warn/20 text-warn",
  idea: "bg-ink-3/20 text-ink-3",
  paused: "bg-ink-3/20 text-ink-3",
  closed: "bg-danger/20 text-danger",
};

export default function VenturesOverviewPage() {
  // Shared cache with /ventures/tree and /ventures/[id]'s all-ventures fetch.
  const { data } = useApi<{ ventures: Venture[] }>("/api/ventures");
  const ventures = data?.ventures ?? null;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of ventures ?? []) {
      counts[v.status] = (counts[v.status] || 0) + 1;
    }
    return counts;
  }, [ventures]);

  const topLevel = useMemo(() => {
    if (!ventures) return [];
    return ventures.filter(
      (v) => v.kind === "organisation" || !v.parent_id,
    );
  }, [ventures]);

  const childCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of ventures ?? []) {
      if (v.parent_id) counts[v.parent_id] = (counts[v.parent_id] || 0) + 1;
    }
    return counts;
  }, [ventures]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Ventures
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Every business, project, and idea under one roof.
        </p>
      </header>

      {ventures === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(["launched", "building", "exploring", "idea", "paused", "closed"] as const).map(
              (s) =>
                (statusCounts[s] ?? 0) > 0 && (
                  <span
                    key={s}
                    className={`px-3 py-1 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase ${STATUS_COLOURS[s] ?? ""}`}
                  >
                    {s} {statusCounts[s]}
                  </span>
                ),
            )}
          </div>

          {topLevel.length === 0 ? (
            <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
              No ventures yet. Start by adding an idea.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topLevel.map((v) => (
                <Link
                  key={v.id}
                  href={`/ventures/${v.id}`}
                  className="growth-in block rounded-md bg-ink-1 hover:bg-ink-2 transition-colors p-4 border-l-4"
                  style={{ borderLeftColor: v.accent_colour }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-[family-name:var(--font-display)] text-xl text-text-0 truncate">
                        {v.name}
                      </div>
                      {v.tagline && (
                        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5">
                          {v.tagline}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase ${STATUS_COLOURS[v.status] ?? ""}`}
                    >
                      {v.status}
                    </span>
                  </div>
                  {v.description && (
                    <p className="text-xs text-text-2 mt-2 line-clamp-2">
                      {v.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <Mono className="text-[10px] text-ink-3">{v.kind}</Mono>
                    {(childCount[v.id] ?? 0) > 0 && (
                      <Mono className="text-[10px] text-ink-3">
                        {childCount[v.id]} child
                        {childCount[v.id] === 1 ? "" : "ren"}
                      </Mono>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
