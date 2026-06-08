"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { BlockerRow } from "@/lib/blockers";
import type { CardWidth } from "@/lib/dashboard/card-registry";

type Response = { blockers: BlockerRow[]; total: number };

function tone(b: BlockerRow): "hot" | "warm" {
  if (b.isOverdue) return "hot";
  if (b.key && b.urgency === "today") return "hot";
  return "warm";
}

function pillLabel(b: BlockerRow): string {
  if (b.isOverdue) return "HOT";
  if (b.key && b.urgency === "today") return "HOT";
  return "WARM";
}

function Pill({ b }: { b: BlockerRow }) {
  const t = tone(b);
  const cls =
    t === "hot"
      ? "bg-danger/15 text-danger border-danger/40"
      : "bg-warn/15 text-warn border-warn/40";
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${cls}`}
    >
      {pillLabel(b)}
    </span>
  );
}

function stuckLabel(d: number): string {
  if (d <= 0) return "STUCK <1d";
  return `STUCK ${d}d`;
}

export function KeyBlockers({ width = 2 }: { width?: CardWidth } = {}) {
  const router = useRouter();
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/blockers", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as Response;
        if (!mounted) return;
        setData({
          blockers: Array.isArray(j?.blockers) ? j.blockers : [],
          total: typeof j?.total === "number" ? j.total : 0,
        });
      } catch {
        /* keep prior data */
      }
    }

    void load();
    const id = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const total = data?.total ?? 0;
  const shown = data?.blockers ?? [];
  const userId = process.env.NEXT_PUBLIC_USER_ID ?? null;

  function ownerLabel(owner: string | null): string {
    if (!owner) return "OWNER —";
    if (userId && owner === userId) return "OWNER You";
    if (owner.toLowerCase() === "phil") return "OWNER You";
    return `OWNER ${owner}`;
  }

  function open(id: string) {
    router.push(`/organisation/tasks?focus=${encodeURIComponent(id)}`);
  }

  return (
    <Panel
      borderless
      title="KEY BLOCKERS"
      topRight={
        <Link
          href="/organisation/tasks?filter=blockers"
          className="flex items-center gap-2 hover:text-ink-4 transition-colors"
        >
          <Mono>{total} ACTIVE</Mono>
          <span>VIEW ALL →</span>
        </Link>
      }
      bottomCTA={
        total > shown.length ? (
          <Link
            href="/organisation/tasks?filter=blockers"
            className="cursor-pointer hover:text-ink-4"
          >
            + {total - shown.length} MORE · VIEW ALL →
          </Link>
        ) : undefined
      }
    >
      {data === null ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-10 rounded-md bg-ink-2/30 animate-pulse"
            />
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
          Nothing blocking — nice.
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-2 tabular-nums">
            <span className="font-[family-name:var(--font-display)] text-3xl font-medium text-text-0 leading-none">
              {total}
            </span>
            <span className="text-sm text-text-1">
              active {total === 1 ? "blocker" : "blockers"}
            </span>
          </div>
        <ul
          className={
            width >= 3
              ? "grid grid-cols-2 gap-x-6"
              : "flex flex-col divide-y divide-ink-2"
          }
        >
          {shown.map((b) => (
            <li
              key={b.id}
              className={width >= 3 ? "border-b border-ink-2 last:border-b-0" : ""}
            >
              <button
                type="button"
                onClick={() => open(b.id)}
                className={`w-full text-left flex items-start gap-3 py-2.5 ${
                  width >= 3 ? "" : "first:pt-0 last:pb-0"
                } hover:bg-ink-2/30 transition-colors px-1 -mx-1 rounded-md`}
              >
                <div className="flex-1 min-w-0">
                  {b.parent_title && (
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-0.5 truncate">
                      ↑ {b.parent_title}
                    </div>
                  )}
                  <div className="text-sm text-ink-4 break-words leading-snug">
                    {b.title}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
                    {ownerLabel(b.owner)} · {stuckLabel(b.stuckDays)}
                  </div>
                </div>
                <Pill b={b} />
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </Panel>
  );
}
