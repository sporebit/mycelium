"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/data/useApi";
import { localDateKey } from "@/lib/util/date";
import { buildIndex, type HoursIndex } from "@/lib/hours/calc";
import type { HoursBundle } from "@/lib/hours/types";

export const HOURS_BUNDLE_KEY = "/api/hours/bundle";

/** The bundle and its index, built once per fetch. `today` is Europe/London. */
export function useHoursBundle() {
  const { data, isLoading, mutate, error } = useApi<HoursBundle>(HOURS_BUNDLE_KEY);
  const today = localDateKey();
  const index: HoursIndex | null = useMemo(() => (data ? buildIndex(data, today) : null), [data, today]);
  return { bundle: data ?? null, index, today, isLoading, error, mutate };
}
