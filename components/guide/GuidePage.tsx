"use client";

import { useApi } from "@/lib/data/useApi";
import { FieldGuide } from "./FieldGuide";
import { useStepsPatch, type StepsPayload } from "./useStepsPatch";

type Payload = StepsPayload & { key: string; title: string; kind: string };

/** The standalone Field guide (design §3.1): the server page hands over the first read; ticks save through the steps route. */
export function GuidePage({ initial, projectName }: { initial: Payload; projectName: string | null }) {
  const key = `/api/tickets/${encodeURIComponent(initial.key)}/steps`;
  const { data, mutate } = useApi<Payload>(key, { fallbackData: initial });
  const { patch, busy, err } = useStepsPatch(key, mutate);
  const d = data ?? initial;
  if (!d.definition) return <p className="fg-root fg-soft min-h-screen p-6">This ticket has no guide.</p>;
  return (
    <>
      <FieldGuide
        definition={d.definition}
        state={d.state}
        kind={d.kind}
        onPatch={patch}
        busy={busy}
        frame="page"
        ticketKey={d.key ?? initial.key}
        title={d.title}
        projectName={projectName}
      />
      {err && (
        <p role="alert" className="fg-ui fg-amber-t fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg px-3 py-2 text-[14px] fg-card">
          Not saved: {err}
        </p>
      )}
    </>
  );
}
