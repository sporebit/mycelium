import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the window changes.
 * `serverDefault` is the answer during server rendering and the first
 * client render, so the two agree and nothing flashes.
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
