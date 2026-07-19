"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/data/useApi";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { VentureRow } from "@/components/ventures/this-week/VentureRow";
import { IncubatorStrip } from "@/components/ventures/this-week/IncubatorStrip";
import type { Venture } from "@/lib/ventures/types";

export default function VenturesThisWeekPage() {
  const { data } = useApi<{ ventures: Venture[] }>("/api/ventures");
  const { prefs, setPrefs } = useUiPrefs();
  const ventures = data?.ventures ?? null;

  const { active, ideas } = useMemo(() => {
    const list = ventures ?? [];
    return {
      active: list.filter(
        (v) => v.status !== "closed" && v.status !== "idea",
      ),
      ideas: list.filter((v) => v.status === "idea"),
    };
  }, [ventures]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-text-hi tracking-[-0.02em] leading-[1.15]">
          This Week
        </h1>
        <p className="text-sm text-text-mid">
          Every active venture with its next move.
        </p>
      </header>

      {ventures === null ? (
        <div className="text-sm text-text-lo italic py-12 text-center">
          Loading…
        </div>
      ) : active.length === 0 ? (
        <div className="text-sm text-text-lo italic py-8 text-center">
          Nothing active. Move an incubator idea up when you're ready.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((v) => (
            <li key={v.id}>
              <VentureRow venture={v} />
            </li>
          ))}
        </ul>
      )}

      {ventures !== null && ideas.length > 0 && (
        <IncubatorStrip
          ideas={ideas}
          expanded={prefs.ventures_incubator_expanded}
          onToggle={(v) =>
            void setPrefs({ ventures_incubator_expanded: v })
          }
        />
      )}
    </div>
  );
}
