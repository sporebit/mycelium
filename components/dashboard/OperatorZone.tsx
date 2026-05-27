"use client";

import { useEffect, useState } from "react";
import { OPERATOR } from "@/lib/config/operator";
import type { HeadlineCandidate } from "@/lib/dashboard/headlines";

const LAST_HEADLINE_KEY = "mycelium:lastHeadlineId";

const FALLBACK: HeadlineCandidate = {
  id: "default",
  headline: "Voice anything. The network listens.",
  body: "Capture, log, decide — all from one box.",
};

/**
 * Greeting zone at the top of the home dashboard.
 *
 * The server pre-computes the set of matching rule candidates from real
 * data (see lib/dashboard/headlines.ts). This component picks one at
 * random on the client, excluding whichever id was shown last time
 * (tracked in localStorage), so the same line doesn't repeat back-to-back.
 */
export function OperatorZone({
  candidates = [],
}: {
  candidates?: HeadlineCandidate[];
}) {
  const initial = candidates[0] ?? FALLBACK;
  const [picked, setPicked] = useState<HeadlineCandidate>(initial);
  const [greeting, setGreeting] = useState<string>("");

  // Time-aware greeting — recomputes hourly.
  useEffect(() => {
    const immediate = window.setTimeout(() => setGreeting(computeGreeting()), 0);
    const now = new Date();
    const msToNextHour =
      60 * 60 * 1000 - ((now.getMinutes() * 60 + now.getSeconds()) * 1000);
    const hourly = window.setTimeout(
      () => setGreeting(computeGreeting()),
      msToNextHour
    );
    return () => {
      clearTimeout(immediate);
      clearTimeout(hourly);
    };
  }, []);

  // Pick a headline, excluding the last-shown id when possible. The
  // pick is deferred via setTimeout so the impure reads (localStorage,
  // Math.random) stay outside the effect body — same pattern as the
  // greeting effect above.
  useEffect(() => {
    if (candidates.length === 0) return;
    const id = window.setTimeout(() => {
      let lastId: string | null = null;
      try {
        lastId = window.localStorage.getItem(LAST_HEADLINE_KEY);
      } catch {
        /* private mode / disabled storage */
      }
      const filtered =
        candidates.length > 1
          ? candidates.filter((c) => c.id !== lastId)
          : candidates;
      const pool = filtered.length > 0 ? filtered : candidates;
      const next = pool[Math.floor(Math.random() * pool.length)];
      setPicked(next);
      try {
        window.localStorage.setItem(LAST_HEADLINE_KEY, next.id);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [candidates]);

  return (
    <section className="px-1 pt-12 pb-8 sm:pt-16 sm:pb-10">
      <div className="text-text-1 text-sm">{greeting || " "}</div>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl sm:text-[28px] leading-[1.3] text-text-0 font-medium max-w-[36rem]">
        {picked.headline}
      </h1>
      <p className="mt-3 text-base text-text-1 max-w-[36rem]">{picked.body}</p>
    </section>
  );
}

function computeGreeting(): string {
  const tz = OPERATOR.timezone;
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(now)
  );
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: tz,
  }).format(now);

  let part: string;
  if (hour < 5) part = "night";
  else if (hour < 12) part = "morning";
  else if (hour < 17) part = "afternoon";
  else if (hour < 22) part = "evening";
  else part = "night";

  return `${day} ${part}, ${OPERATOR.firstName}`;
}
