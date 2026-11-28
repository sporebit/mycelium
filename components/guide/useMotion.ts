"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { countAt, durationFor, motionLevel, type MotionLevel } from "@/lib/guides/motion";

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

/** The page's motion level, following Settings and the OS as they change. "full" on the server. */
export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore(subscribe, () => motionLevel(), () => "full" as MotionLevel);
}

/** A number that counts to its target over 400 ms (D13); jumps under reduced or no motion. */
export function useCountUp(target: number, level: MotionLevel): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const duration = durationFor("count", level);
    const start = from.current;
    from.current = target;
    if (duration === 0 || start === target) {
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const v = countAt(start, target, t - t0, duration);
      setShown(v);
      if (v !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, level]);
  return shown;
}
