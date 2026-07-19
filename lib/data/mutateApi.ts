"use client";

import { mutate as globalMutate } from "swr";

export type MutateOpts = {
  onError?: (e: unknown) => void;
  revalidate?: boolean;
};

/**
 * Optimistic mutation for an SWR-cached key.
 * On failure SWR rolls the cache back automatically; opts.onError fires
 * if provided, otherwise a window CustomEvent "api-error" is dispatched
 * for <ApiErrorToast/> in Shell to render.
 */
export async function mutateApi<T>(
  key: string,
  optimistic: T | ((current: T | undefined) => T),
  patch: () => Promise<unknown>,
  opts?: MutateOpts,
): Promise<void> {
  try {
    await globalMutate<T>(
      key,
      async () => {
        await patch();
        // populateCache:false means the revalidate below refills the cache
        // from the server, not from this return value. Return undefined
        // to satisfy the SWR type; the value is ignored.
        return undefined as unknown as T;
      },
      {
        optimisticData: optimistic,
        rollbackOnError: true,
        populateCache: false,
        revalidate: opts?.revalidate ?? true,
      },
    );
  } catch (e) {
    if (opts?.onError) {
      opts.onError(e);
    } else if (typeof window !== "undefined") {
      const msg = e instanceof Error ? e.message : "API error";
      window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));
    }
  }
}
