"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  | { kind: "hidden" }
  | { kind: "android"; prompt: () => void }
  | { kind: "ios" };

export function useInstallPrompt(): {
  state: InstallState;
  dismiss: () => void;
} {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("pwa-dismissed") === "1",
  );
  // Computed once at mount — these don't change during the session
  const [standalone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  );
  const [ios] = useState(
    () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window),
  );

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem("pwa-dismissed", "1");
  }, []);

  const prompt = useCallback(() => {
    deferredPrompt?.prompt();
    deferredPrompt?.userChoice.then(() => setDeferredPrompt(null));
  }, [deferredPrompt]);

  if (dismissed || standalone) {
    return { state: { kind: "hidden" }, dismiss };
  }

  if (deferredPrompt) {
    return { state: { kind: "android", prompt }, dismiss };
  }

  if (ios) {
    return { state: { kind: "ios" }, dismiss };
  }

  return { state: { kind: "hidden" }, dismiss };
}
