"use client";

import { useCallback } from "react";
import { mutate as globalMutate } from "swr";
import { apiWrite, jsonBody, reportApiError } from "@/lib/data/apiWrite";
import { keyFor } from "@/lib/hours/ticket";
import type { HoursBundle, HoursEntry } from "@/lib/hours/types";
import { HOURS_BUNDLE_KEY } from "./useHours";

export type EntryInput = {
  entry_date?: string | null;
  minutes?: number | string | null;
  estimate_minutes?: number | string | null;
  description?: string;
  ticket?: string;
  logged?: boolean;
};

function optimisticEntry(input: EntryInput, now: string): HoursEntry {
  const ticket = input.ticket ?? "";
  return {
    id: `tmp-${now}-${Math.random().toString(36).slice(2, 8)}`,
    entry_date: input.entry_date ?? null,
    minutes: typeof input.minutes === "number" ? input.minutes : null,
    estimate_minutes: typeof input.estimate_minutes === "number" ? input.estimate_minutes : null,
    description: input.description ?? "",
    ticket_raw: ticket,
    ticket_key: keyFor(ticket),
    logged: input.logged ?? false,
    source: "manual",
    source_row: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Writes for the Log, each applied to the cached bundle first so the row
 * appears or changes at once (a day of ten quick entries must not wait on
 * the network), then confirmed by a revalidation. A refused write rolls the
 * cache back and surfaces the server's message through <ApiErrorToast/>.
 */
export function useEntryMutations() {
  const add = useCallback(async (input: EntryInput): Promise<boolean> => {
    const now = new Date().toISOString();
    const temp = optimisticEntry(input, now);
    let ok = true;
    await globalMutate<HoursBundle>(
      HOURS_BUNDLE_KEY,
      async (current) => {
        try {
          const { entry } = await apiWrite<{ entry: HoursEntry }>("/api/hours/entries", { method: "POST", ...jsonBody(input) });
          return current ? { ...current, entries: [...current.entries.filter((e) => e.id !== temp.id), entry] } : current;
        } catch (e) {
          ok = false;
          reportApiError(e, "Could not add the entry");
          throw e;
        }
      },
      {
        optimisticData: (current) => (current ? { ...current, entries: [...current.entries, temp] } : (current as unknown as HoursBundle)),
        rollbackOnError: true,
        populateCache: true,
        revalidate: true,
      },
    ).catch(() => undefined);
    return ok;
  }, []);

  const patch = useCallback(async (id: string, input: EntryInput): Promise<boolean> => {
    let ok = true;
    await globalMutate<HoursBundle>(
      HOURS_BUNDLE_KEY,
      async (current) => {
        try {
          const { entry } = await apiWrite<{ entry: HoursEntry }>(`/api/hours/entries/${id}`, { method: "PATCH", ...jsonBody(input) });
          return current ? { ...current, entries: current.entries.map((e) => (e.id === id ? entry : e)) } : current;
        } catch (e) {
          ok = false;
          reportApiError(e, "Could not save the entry");
          throw e;
        }
      },
      {
        optimisticData: (current) => {
          if (!current) return current as unknown as HoursBundle;
          const now = new Date().toISOString();
          return {
            ...current,
            entries: current.entries.map((e) => {
              if (e.id !== id) return e;
              const next: HoursEntry = { ...e, updated_at: now };
              if ("entry_date" in input) next.entry_date = input.entry_date ?? null;
              if ("minutes" in input) next.minutes = typeof input.minutes === "number" ? input.minutes : e.minutes;
              if ("estimate_minutes" in input) next.estimate_minutes = typeof input.estimate_minutes === "number" ? input.estimate_minutes : input.estimate_minutes === null ? null : e.estimate_minutes;
              if (input.description !== undefined) next.description = input.description;
              if (input.ticket !== undefined) {
                next.ticket_raw = input.ticket;
                next.ticket_key = keyFor(input.ticket);
              }
              if (input.logged !== undefined) next.logged = input.logged;
              return next;
            }),
          };
        },
        rollbackOnError: true,
        populateCache: true,
        revalidate: true,
      },
    ).catch(() => undefined);
    return ok;
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    let ok = true;
    await globalMutate<HoursBundle>(
      HOURS_BUNDLE_KEY,
      async (current) => {
        try {
          await apiWrite(`/api/hours/entries/${id}`, { method: "DELETE" });
          return current ? { ...current, entries: current.entries.filter((e) => e.id !== id) } : current;
        } catch (e) {
          ok = false;
          reportApiError(e, "Could not delete the entry");
          throw e;
        }
      },
      {
        optimisticData: (current) => (current ? { ...current, entries: current.entries.filter((e) => e.id !== id) } : (current as unknown as HoursBundle)),
        rollbackOnError: true,
        populateCache: true,
        revalidate: true,
      },
    ).catch(() => undefined);
    return ok;
  }, []);

  return { add, patch, remove };
}
