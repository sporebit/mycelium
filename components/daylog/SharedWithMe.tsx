"use client";

/**
 * Day log entries other people have marked shared with you (0169): whose,
 * which day, their own summary and their scenes. Read-only. Nothing is
 * shown when nobody has shared anything, so a person with no shares never
 * sees an empty box.
 */
import { useApi } from "@/lib/data/useApi";

type Scene = { position: number; title: string; time_hint: string | null; narrative: string | null };
type SharedDay = { id: string; day: string; owner_id: string; owner_name: string; summary: string | null; scenes: Scene[] };

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function SharedWithMe() {
  const { data } = useApi<{ days: SharedDay[] }>("/api/journal/shared", { revalidateOnFocus: false });
  const days = data?.days ?? [];
  if (!days.length) return null;
  return (
    <section aria-label="Shared with me" className="flex flex-col gap-2" data-testid="daylog-shared">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-lo">Shared with me</h2>
      {days.slice(0, 14).map((d) => (
        <details key={d.id} className="rounded-v2-md border border-hairline bg-surface-1 px-4 py-3">
          <summary className="flex cursor-pointer items-baseline justify-between gap-3 text-sm text-text-hi">
            <span>
              {d.owner_name} <span className="text-text-lo">· {dayLabel(d.day)}</span>
            </span>
            <span className="text-[12px] text-text-lo">{d.scenes.length === 1 ? "1 scene" : `${d.scenes.length} scenes`}</span>
          </summary>
          {d.summary ? <p className="mt-2 whitespace-pre-line text-sm text-text-mid">{d.summary}</p> : null}
          {d.scenes.length ? (
            <ul className="mt-2 flex flex-col gap-2">
              {d.scenes.map((s) => (
                <li key={s.position} className="text-sm">
                  <span className="text-text-hi">{s.title}</span>
                  {s.time_hint ? <span className="text-text-lo"> · {s.time_hint}</span> : null}
                  {s.narrative ? <p className="whitespace-pre-line text-text-mid">{s.narrative}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ))}
    </section>
  );
}
