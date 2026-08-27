"use client";

import { ApiError } from "./useApi";

/**
 * A mutating fetch whose failure cannot be silently ignored.
 *
 * `fetch` only rejects on a network fault — a 4xx or 5xx resolves normally.
 * So a bare `await fetch(...)` inside an optimistic handler leaves the UI
 * showing a change the server refused, with no error and no rollback, until
 * something else happens to re-read from the server. This throws on a
 * non-ok response, which forces the caller to handle it.
 *
 * Pair with reportApiError() to surface the failure through <ApiErrorToast/>.
 * For anything already in the SWR cache, prefer mutateApi() — it does the
 * rollback for you.
 */
export async function apiWrite<T = unknown>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(j.error ?? `${res.status} ${path}`, res.status);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** Surface a caught error through the app-wide <ApiErrorToast/>. */
export function reportApiError(e: unknown, fallback = "Save failed"): void {
  if (typeof window === "undefined") return;
  const msg = e instanceof Error && e.message ? e.message : fallback;
  window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));
}

/** JSON body helper — every write in this codebase sends the same headers. */
export function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
