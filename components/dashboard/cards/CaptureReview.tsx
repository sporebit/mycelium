"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { CardWidth } from "@/lib/dashboard/card-registry";

const REFRESH_MS = 60_000;

export function CaptureReview(_props: { width?: CardWidth } = {}) {
  void _props;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/captures/review/pending-count", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { count?: number }) => {
          if (cancelled) return;
          setCount(typeof j?.count === "number" ? j.count : 0);
        })
        .catch(() => {
          if (cancelled) return;
          setCount(0);
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const tone =
    count === null
      ? "muted"
      : count === 0
        ? "ok"
        : count > 5
          ? "warn"
          : "muted";

  return (
    <Panel
      borderless
      title="CAPTURE REVIEW"
      status={count === 0 ? "CLEAR" : count !== null ? "QUEUE" : undefined}
      statusTone={tone}
      topRight={<Mono>QUEUE</Mono>}
      bottomCTA={
        <Link
          href="/organisation/captures/review"
          className="hover:text-ink-4 transition-colors"
        >
          REVIEW →
        </Link>
      }
    >
      {count === null ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="card-eyebrow">Backlog</span>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="font-[family-name:var(--font-display)] text-3xl font-medium text-text-0 leading-none">
              0
            </span>
            <span className="text-sm text-text-1">to review</span>
          </div>
          <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
            Every capture has been triaged.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="card-eyebrow">Backlog</span>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span
              className={`font-[family-name:var(--font-display)] text-3xl font-medium leading-none ${
                count > 5 ? "text-warn" : "text-text-0"
              }`}
            >
              {count}
            </span>
            <span className="text-sm text-text-1">
              {count === 1 ? "capture" : "captures"} to review
            </span>
          </div>
          <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
            Captures the classifier wasn&apos;t sure about, or that have sat
            unreviewed for over an hour.
          </p>
        </div>
      )}
    </Panel>
  );
}
