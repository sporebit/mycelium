"use client";

import { useCallback, useEffect, useState } from "react";
import { pendingCount } from "./queue";
import { processQueue } from "./sync";

export type SyncState = "synced" | "offline" | "pending";

export function useSync() {
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" ? navigator.onLine : true,
  );
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
      setOnline(true);
      void sync();
    }
    function goOffline() {
      setOnline(false);
    }
    function onFocus() {
      void refresh();
      if (navigator.onLine) void sync();
    }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", onFocus);

    void refresh();
    if (navigator.onLine) void sync();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, sync]);

  const state: SyncState = !online ? "offline" : pending > 0 ? "pending" : "synced";

  return { state, pending, online, sync, refresh };
}
