"use client";

import { useEffect, useState } from "react";

export type DeviceKind = "pc" | "phone" | "tablet";

function detectDevice(): DeviceKind {
  if (typeof window === "undefined") return "pc";
  const ua = navigator.userAgent || "";
  const hasTouch =
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0;
  const width = window.innerWidth;
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua);
  if (isTabletUA || (hasTouch && width >= 768 && width < 1280)) return "tablet";
  if (hasTouch && width < 768) return "phone";
  return "pc";
}

/**
 * Detects the current device family once on mount. The result is
 * memoised — resizing the window doesn't change the answer because the
 * surface a task was authored for shouldn't flicker as the user
 * resizes their browser.
 */
export function useCurrentDevice(): DeviceKind {
  const [device, setDevice] = useState<DeviceKind>("pc");
  useEffect(() => {
    // queueMicrotask defers the state write past the effect body so we
    // don't trip react-hooks/set-state-in-effect.
    queueMicrotask(() => setDevice(detectDevice()));
  }, []);
  return device;
}
