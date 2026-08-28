"use client";

import { useCallback, useRef, useState } from "react";

/** Horizontal travel before a swipe commits. */
const SWIPE_THRESHOLD = 72;
/** Hold time that enters bulk-select mode. */
const LONG_PRESS_MS = 500;
/** Drift still forgiven while deciding "is this a press or a drag?". */
const MOVE_TOLERANCE = 8;

export type RowGestureOptions = {
  /** Swipe right — mark done. */
  onSwipeRight?: () => void;
  /** Swipe left — reveal reschedule. */
  onSwipeLeft?: () => void;
  /** Long press — enter bulk-select. */
  onLongPress?: () => void;
  enabled?: boolean;
};

/**
 * Touch gestures for a task row, built on pointer events and raw deltas —
 * no gesture library, per the P4 spec.
 *
 * Only reacts to `pointerType === "touch"`, so mouse and trackpad behaviour
 * on desktop is completely untouched. Vertical intent wins over horizontal:
 * if the finger travels further down than across, the row never translates
 * and the page scrolls normally.
 */
export function useRowGestures({
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  enabled = true,
}: RowGestureOptions) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  // Set when a gesture consumed the interaction, so the row's onClick can
  // bail out instead of also opening the task.
  const consumed = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== "touch") return;
      start.current = { x: e.clientX, y: e.clientY };
      longFired.current = false;
      consumed.current = false;
      if (onLongPress) {
        timer.current = window.setTimeout(() => {
          longFired.current = true;
          consumed.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }
    },
    [enabled, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const ddx = e.clientX - start.current.x;
      const ddy = e.clientY - start.current.y;
      if (Math.abs(ddx) > MOVE_TOLERANCE || Math.abs(ddy) > MOVE_TOLERANCE) {
        clearTimer();
      }
      // Vertical intent wins, so the list still scrolls under the finger.
      if (Math.abs(ddx) > Math.abs(ddy)) setDx(ddx);
    },
    [clearTimer],
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      clearTimer();
      const s = start.current;
      start.current = null;
      setDx(0);
      if (!s || longFired.current) return;
      const ddx = e.clientX - s.x;
      const ddy = e.clientY - s.y;
      if (Math.abs(ddx) <= Math.abs(ddy)) return;
      if (ddx > SWIPE_THRESHOLD) {
        consumed.current = true;
        onSwipeRight?.();
      } else if (ddx < -SWIPE_THRESHOLD) {
        consumed.current = true;
        onSwipeLeft?.();
      }
    },
    [clearTimer, onSwipeLeft, onSwipeRight],
  );

  const cancel = useCallback(() => {
    clearTimer();
    start.current = null;
    setDx(0);
  }, [clearTimer]);

  /** True when a gesture already handled this interaction. */
  const didConsume = useCallback(() => consumed.current, []);

  return {
    dx,
    didConsume,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
    },
  };
}
