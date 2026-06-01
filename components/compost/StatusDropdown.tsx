"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "@/lib/types/task";

const DROPDOWN_WIDTH = 200; // matches min-w + padding
const DROPDOWN_VERTICAL_MARGIN = 6;

type DropdownPosition = {
  top: number;
  left: number;
  /** When the dropdown would otherwise extend past the viewport
   *  right edge, we render it flush to the trigger's right edge
   *  instead. The "flip leftward" behaviour. */
  flipped: boolean;
};

/**
 * Status pill that, on click, opens a 10-option dropdown to change
 * status inline.
 *
 * Renders the dropdown via a portal anchored to document.body with
 * position:fixed coordinates derived from the trigger's bounding
 * rect. This escapes parent overflow / transformed ancestor clipping
 * — the previous in-flow absolute positioning got clipped inside
 * narrow detail panes on the right of the viewport.
 */
export function StatusDropdown({
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Compute fixed coordinates for the dropdown from the trigger's
  // bounding rect. Re-runs on scroll / resize while open so the
  // dropdown stays glued to the pill.
  useLayoutEffect(() => {
    if (!open) return;
    function compute() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const viewportW =
        typeof window !== "undefined" ? window.innerWidth : DROPDOWN_WIDTH;
      const viewportH =
        typeof window !== "undefined" ? window.innerHeight : 800;
      // Default: anchor dropdown's left edge to the trigger's left edge.
      // When it would overflow right, anchor to the trigger's right edge.
      let left = r.left;
      let flipped = false;
      if (left + DROPDOWN_WIDTH > viewportW - 8) {
        left = Math.max(8, r.right - DROPDOWN_WIDTH);
        flipped = true;
      }
      // Default: drop downward from the trigger. If there's not enough
      // room below, flip above.
      let top = r.bottom + DROPDOWN_VERTICAL_MARGIN;
      const estimatedHeight = 340; // 10 rows * 32px-ish
      if (top + estimatedHeight > viewportH - 8) {
        top = Math.max(8, r.top - DROPDOWN_VERTICAL_MARGIN - estimatedHeight);
      }
      setPos({ top, left, flipped });
    }
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      // Don't close if the click landed inside either the trigger or
      // the portal-rendered dropdown.
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tone = TASK_STATUS_TONE[value];
  const sizeCls =
    size === "sm"
      ? "text-[9px] tracking-[0.12em] px-1.5 py-0.5"
      : "text-[10px] tracking-[0.15em] px-2 py-0.5";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel ?? `Status: ${TASK_STATUS_LABEL[value]}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`uppercase font-[family-name:var(--font-mono)] rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-2/60 ${sizeCls} ${tone.fg} ${tone.bg} ${tone.border}`}
      >
        {TASK_STATUS_LABEL[value]}
      </button>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: DROPDOWN_WIDTH,
              zIndex: 1000,
            }}
            className="rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-1 flex flex-col gap-0.5"
          >
            {TASK_STATUSES.map((s) => {
              const t = TASK_STATUS_TONE[s];
              const isActive = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    if (s !== value) onChange(s);
                  }}
                  className={`text-left text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1.5 rounded-sm flex items-center gap-2 hover:bg-ink-2/60 transition-colors ${
                    isActive ? "ring-1 ring-glow-2/40" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 rounded-full border ${t.bg} ${t.border}`}
                  />
                  <span className={t.fg}>{TASK_STATUS_LABEL[s]}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
