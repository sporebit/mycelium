"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { pendingCount } from "./queue";
import { processQueue } from "./sync";

export type SyncState = "synced" | "offline" | "pending";

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Whether the browser is online. The server cannot know, and says "online":
 * Node has a global `navigator` of its own with no `onLine`, so asking it
 * rendered "Offline" on the server and "Synced" in the browser, and the
 * page failed to hydrate.
 */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useSync() {
  const online = useOnline();
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const n = await pendingCount();
      setPending(n);
    } catch {
      // IDB unavailable
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    await processQueue();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    function goOnline() {
      void sync();
    }
    function onFocus() {
      void refresh();
      if (navigator.onLine) void sync();
    }

    window.addEventListener("online", goOnline);
    window.addEventListener("focus", onFocus);

    queueMicrotask(() => {
      void refresh();
      if (navigator.onLine) void sync();
    });

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, sync]);

  const state: SyncState = !online ? "offline" : pending > 0 ? "pending" : "synced";

  return { state, pending, online, sync, refresh };
}
