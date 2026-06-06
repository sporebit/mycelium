"use client";

import { useEffect, useRef } from "react";
import { useTransition } from "@/lib/context/TransitionContext";

const BLOOM_MS = 480;
const REVEAL_MS = 400;

export function TransitionOverlay() {
  const { state, clear } = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !state.active) return;

    el.style.background = state.colour;
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";

    if (state.direction === "enter") {
      el.style.clipPath = `circle(0px at ${state.originX}px ${state.originY}px)`;
      void el.offsetHeight;
      el.style.transition = `clip-path ${BLOOM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      el.style.clipPath = `circle(150vmax at ${state.originX}px ${state.originY}px)`;

      const revealTimer = setTimeout(() => {
        el.style.transition = `opacity ${REVEAL_MS}ms ease-out`;
        el.style.opacity = "0";
      }, BLOOM_MS);

      const clearTimer = setTimeout(() => {
        el.style.pointerEvents = "none";
        el.style.transition = "none";
        el.style.clipPath = "none";
        clear();
      }, BLOOM_MS + REVEAL_MS);

      return () => {
        clearTimeout(revealTimer);
        clearTimeout(clearTimer);
      };
    }

    // exit: bloom out from origin, then fade
    el.style.clipPath = `circle(0px at ${state.originX}px ${state.originY}px)`;
    void el.offsetHeight;
    el.style.transition = `clip-path ${BLOOM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    el.style.clipPath = `circle(150vmax at ${state.originX}px ${state.originY}px)`;

    const revealTimer = setTimeout(() => {
      el.style.transition = `opacity ${REVEAL_MS}ms ease-out`;
      el.style.opacity = "0";
    }, BLOOM_MS);

    const clearTimer = setTimeout(() => {
      el.style.pointerEvents = "none";
      el.style.transition = "none";
      el.style.clipPath = "none";
      clear();
    }, BLOOM_MS + REVEAL_MS);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(clearTimer);
    };
  }, [state.active, state.colour, state.originX, state.originY, state.direction, clear]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: 0,
      }}
    />
  );
}
