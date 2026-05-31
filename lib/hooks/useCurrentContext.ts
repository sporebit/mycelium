"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_CONTEXT, type CurrentContext } from "@/lib/types/context";

const STORAGE_KEY = "mycelium:currentContext";

function read(): CurrentContext {
  if (typeof window === "undefined") return EMPTY_CONTEXT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CONTEXT;
    const parsed = JSON.parse(raw) as Partial<CurrentContext>;
    return {
      where: typeof parsed.where === "string" ? parsed.where : null,
      device: typeof parsed.device === "string" ? parsed.device : null,
      energy:
        parsed.energy === "low" ||
        parsed.energy === "medium" ||
        parsed.energy === "high"
          ? parsed.energy
          : null,
      context_tag:
        typeof parsed.context_tag === "string" ? parsed.context_tag : null,
    };
  } catch {
    return EMPTY_CONTEXT;
  }
}

/**
 * Read + persist the user's "current context" selection to localStorage.
 * Defaults to all-null so the NOW filter treats the user as
 * "anywhere / any device / any energy / any tag" until they refine.
 */
export function useCurrentContext(): [
  CurrentContext,
  (patch: Partial<CurrentContext>) => void,
] {
  const [ctx, setCtx] = useState<CurrentContext>(EMPTY_CONTEXT);

  useEffect(() => {
    // queueMicrotask defers initial hydration past the effect body so
    // we don't trip react-hooks/set-state-in-effect.
    queueMicrotask(() => setCtx(read()));
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCtx(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<CurrentContext>) => {
    setCtx((prev) => {
      const next: CurrentContext = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* quota — non-fatal */
      }
      return next;
    });
  }, []);

  return [ctx, update];
}
