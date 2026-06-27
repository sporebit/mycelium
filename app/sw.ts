/// <reference lib="webworker" />
import type { PrecacheEntry } from "serwist";
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// ── Push notification handler ──
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string; icon?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Myphelium2", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Myphelium2", {
      body: payload.body ?? "",
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

// ── Background Sync: replay offline mutation queue ──
self.addEventListener("sync", (event) => {
  if (event.tag === "mycelium-sync") {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const { openDB } = await import("idb");
  const db = await openDB("mycelium-offline", 1);
  const ops = await db.getAllFromIndex("syncQueue", "synced", 0);
  for (const op of ops) {
    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: { "Content-Type": "application/json" },
        body: op.body,
      });
      if (res.ok || res.status === 409) {
        op.synced = 1;
        await db.put("syncQueue", op);
      }
    } catch {
      break;
    }
  }
}

// ── Notification click: focus or open the app ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

serwist.addEventListeners();
