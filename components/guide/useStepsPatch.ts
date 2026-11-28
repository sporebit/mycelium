"use client";

import { useState } from "react";
import type { KeyedMutator } from "swr";
import { ticketFetch } from "@/components/tickets/pickers";
import { mergeState, type StatePatch, type StepsDefinition, type StepsState } from "@/lib/tickets/steps";

export type StepsPayload = {
  definition: StepsDefinition | null;
  state: StepsState;
  counts: { done: number; total: number };
};

/**
 * The PATCH to /api/tickets/[key]/steps with the tick shown at once: the
 * state is merged locally the same way the server merges it (mergeState),
 * then replaced by the server's answer, and rolled back if the save fails.
 */
export function useStepsPatch<T extends StepsPayload>(key: string, mutate: KeyedMutator<T>) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = async (p: StatePatch & { definition?: StepsDefinition | null }) => {
    setBusy(true);
    setErr(null);
    await mutate(
      async (current) => {
        const res = await ticketFetch<StepsPayload>(key, { method: "PATCH", body: p });
        return { ...(current as T), ...res } as T;
      },
      {
        revalidate: false,
        rollbackOnError: true,
        optimisticData: p.definition === undefined ? (current) => (current ? { ...current, state: mergeState(current.state, p) } : (current as unknown as T)) : undefined,
      },
    ).catch((e) => setErr(e instanceof Error ? e.message : "save failed"));
    setBusy(false);
  };

  return { patch, busy, err };
}
