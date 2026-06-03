export async function requestBackgroundSync(): Promise<void> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    if ("sync" in reg) {
      await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
        .sync.register("mycelium-sync");
    }
  } catch {
    // Background Sync not supported (iOS) — foreground sync handles it
  }
}
