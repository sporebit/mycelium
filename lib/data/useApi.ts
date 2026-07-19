"use client";

// SWR keys are ALWAYS the raw API path string, exactly as fetched
// (e.g. '/api/tasks?view=smart' includes its query string). Any two
// components using the same path share one cache entry. Never invent
// synthetic keys.

import useSWR, { type SWRConfiguration } from "swr";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

const fetcher = async (path: string): Promise<unknown> => {
  const r = await fetch(path);
  if (!r.ok) throw new ApiError(`${r.status} ${path}`, r.status);
  return r.json();
};

export function useApi<T>(key: string | null, opts?: SWRConfiguration<T>) {
  return useSWR<T>(key, fetcher as (path: string) => Promise<T>, {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
    ...opts,
  });
}
