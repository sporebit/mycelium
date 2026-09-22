"use client";

import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { SharedScene } from "@/lib/daylog/linked";

/**
 * The "with …" cards on the viewer's own day page (daylog spec §5, decision
 * 30): scenes another user's day log placed them in on this date. Read-only,
 * scene basics only. Renders nothing when there is nothing shared.
 */
export function SharedScenes({ date }: { date: string }) {
  const { data } = useApi<{ scenes: SharedScene[] }>(`/api/journal/shared?from=${date}&to=${date}`);
  const scenes = data?.scenes ?? [];
  if (!scenes.length) return null;
  return (
    <section className="rounded-md bg-ink-1 p-4 flex flex-col gap-3">
      <div className="card-eyebrow">With {Array.from(new Set(scenes.map((s) => s.owner_name))).join(" and ")}</div>
      <ul className="flex flex-col gap-3">
        {scenes.map((s) => (
          <li key={s.scene_id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-0">{s.title}</span>
              {(s.place_name ?? s.place_text) && <span className="text-[11px] text-text-2">{s.place_name ?? s.place_text}</span>}
              {s.participants.length > 0 && <Mono className="text-[10px] text-text-2">{s.participants.join(" · ")}</Mono>}
            </div>
            {s.narrative && <p className="text-sm text-text-1 whitespace-pre-wrap">{s.narrative}</p>}
            {s.photos.length > 0 && (
              <ul className="flex gap-2 overflow-x-auto py-1">
                {s.photos.map((p) =>
                  p.url ? (
                    <li key={p.id} className="shrink-0">
                      <a href={p.url} target="_blank" rel="noreferrer" className="block h-20 w-28 overflow-hidden rounded-sm bg-ink-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
                        <img src={p.url} alt={p.caption ?? "photo"} className="h-full w-full object-cover" loading="lazy" />
                      </a>
                      {p.caption && <span className="block text-[11px] text-text-2 truncate w-28">{p.caption}</span>}
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-2 italic">Shared from their day log because they linked you to their People entry. You see the scene, not their notes.</p>
    </section>
  );
}
