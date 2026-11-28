"use client";

import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import type { Overall } from "@/lib/guides/progress";
import type { StepsDefinition, StepsState } from "@/lib/tickets/steps";
import { CopyBlock } from "./CopyBlock";
import { Html } from "./Html";
import { fill, type GuideMode } from "./text";

type StepsPayload = { key: string; title: string; definition: StepsDefinition | null; guide: { overall: Overall } | null };

function NextGuide({ ticketKey }: { ticketKey: string }) {
  const { data, error } = useApi<StepsPayload>(`/api/tickets/${encodeURIComponent(ticketKey)}/steps`);
  // A key the caller cannot see (or that has no guide) is simply not offered.
  if (error || !data || !data.definition) return null;
  const pct = data.guide?.overall.pct ?? 0;
  return (
    <Link href={`/guides/${encodeURIComponent(data.key ?? ticketKey)}`} className="fg-card fg-card-link block rounded-xl p-3">
      <div className="fg-ui fg-soft text-[12px]">
        Next guide · <span className="fg-mono">{data.key ?? ticketKey}</span>
      </div>
      <div className="fg-ink mt-1 text-[16px]">{data.definition.title || data.title}</div>
      <div className="fg-ui fg-soft mt-1 text-[13px]">
        <span className="fg-mono">{pct}%</span> done
      </div>
    </Link>
  );
}

/**
 * The finish (design §3.2.8): what now works, the hand-back prompt to copy,
 * and the next guides that resolve to tickets the caller can see. Plays
 * its moment once (`fg-finish`, 1.2 s; none when motion is off).
 */
export function Finish({ definition: def, state, mode }: { definition: StepsDefinition; state: StepsState; mode: GuideMode }) {
  const unlocks = def.intro?.unlocks ?? [];
  return (
    <section aria-label="Finished" className="fg-finish fg-card rounded-2xl p-4 sm:p-6" data-testid="guide-finish">
      <h2 className="fg-moss-t text-[22px]">What now works</h2>
      {def.finish_html ? (
        <Html html={fill(def.finish_html, def, state, mode)} className="fg-ink mt-2 text-[17px]" />
      ) : unlocks.length > 0 ? (
        <ul className="fg-ink ml-5 mt-2 list-disc text-[17px]">
          {unlocks.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      ) : (
        <p className="fg-ink mt-2 text-[17px]">Every step is ticked.</p>
      )}
      {def.handback_prompt && mode === "me" && (
        <div className="mt-4">
          <CopyBlock kind="prompt" label="Hand back to Claude" text={fill(def.handback_prompt, def, state, mode)} />
        </div>
      )}
      {def.next_guides && def.next_guides.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {def.next_guides.map((k) => (
            <NextGuide key={k} ticketKey={k} />
          ))}
        </div>
      )}
    </section>
  );
}
