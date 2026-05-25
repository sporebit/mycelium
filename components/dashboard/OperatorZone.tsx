"use client";

import { useEffect, useState } from "react";
import { OPERATOR } from "@/lib/config/operator";

/**
 * Greeting zone at the top of the home dashboard.
 *
 * Three layers:
 *   - eyebrow:   "{Day} {time-of-day}, {Name}" (time-aware, client-rendered)
 *   - headline:  short focus sentence in font-display
 *   - body:      tone-setting copy in secondary text
 *
 * The headline and body are passed in by the page so the dashboard can
 * carry seasonal or contextual messaging without touching this component.
 */
export function OperatorZone({
  headline = "Two heavy weeks. The dashboard knows what to surface.",
  body = "Voice anything to feed the network.",
}: {
  headline?: string;
  body?: string;
}) {
  // Lazy init avoids SSR/client mismatch — returns "" on server, recomputes
  // on first client render. The hourly refresh schedules a setTimeout inside
  // the effect callback (not in the effect body) so it stays within the
  // react-hooks/set-state-in-effect rule.
  const [greeting, setGreeting] = useState<string>("");

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

  return (
    <section className="px-1 pt-12 pb-8 sm:pt-16 sm:pb-10">
      <div className="text-text-1 text-sm">{greeting || " "}</div>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl sm:text-[28px] leading-[1.3] text-text-0 font-medium max-w-[36rem]">
        {headline}
      </h1>
      <p className="mt-3 text-base text-text-1 max-w-[36rem]">
        {body}
      </p>
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
