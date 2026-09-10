"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => "PublicKeyCredential" in window;
const getServerSnapshot = () => false;

/**
 * Whether this browser can do WebAuthn. False during server render and
 * hydration, true on the client when supported — without a setState in an
 * effect, which React's lint forbids, and without a hydration mismatch.
 */
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
