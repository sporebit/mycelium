"use client";

import { useSyncExternalStore } from "react";

export type DeviceClass = "pc" | "phone" | "tablet";

const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSnapshot(): DeviceClass {
  const ua = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (ua?.mobile) return "phone";
  if (window.matchMedia(QUERY).matches) return "phone";
  if (/ipad|tablet/i.test(navigator.userAgent)) return "tablet";
  return "pc";
}

function getServerSnapshot(): DeviceClass {
  return "pc";
}

/**
 * Device class for the Now view's auto Tool detection (spec §5): phone →
 * {phone}, desktop → {pc, phone}. useSyncExternalStore keeps the server
 * render deterministic (pc) and re-renders on the client without a
 * set-state-in-effect.
 */
export function useDevice(): DeviceClass {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
