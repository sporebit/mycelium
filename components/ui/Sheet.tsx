"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type SheetSide = "auto" | "bottom" | "right";

const LG_QUERY = "(min-width: 1024px)";

function subscribeMedia(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMatch(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(LG_QUERY).matches;
}
function getServerMatch(): boolean {
  return true;
}

function useResolvedSide(side: SheetSide): "bottom" | "right" {
  const isLarge = useSyncExternalStore(subscribeMedia, getMatch, getServerMatch);
  if (side === "auto") return isLarge ? "right" : "bottom";
  return side;
}

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function Sheet({
  open,
  onClose,
  title,
  side = "auto",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  side?: SheetSide;
  children: ReactNode;
}) {
  const resolvedSide = useResolvedSide(side);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<{ y: number; t: number } | null>(null);

  // Defer past effect body — matches useCurrentDevice's pattern for the
  // React 19 set-state-in-effect rule.
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => setVisible(false));
    const t = setTimeout(() => setDragY(0), 240);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const prevGutter = document.body.style.scrollbarGutter;
    document.body.style.overflow = "hidden";
    document.body.style.scrollbarGutter = "stable";
    return () => {
      document.body.style.overflow = prev;
      document.body.style.scrollbarGutter = prevGutter;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = focusableWithin(panelRef.current)[0];
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusableWithin(panelRef.current);
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    const el = returnFocusRef.current;
    if (el && typeof el.focus === "function") el.focus();
  }, [open]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = { y: e.clientY, t: performance.now() };
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);
  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dy = Math.max(0, e.clientY - dragStartRef.current.y);
    setDragY(dy);
  }, []);
  const onHandlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start) return;
      const dy = Math.max(0, e.clientY - start.y);
      const dt = performance.now() - start.t;
      const velocity = dy / Math.max(dt, 1);
      const height = panelRef.current?.getBoundingClientRect().height ?? 0;
      if (dy > height * 0.3 || velocity > 0.5) {
        onClose();
      } else {
        setDragY(0);
      }
    },
    [onClose],
  );

  if (!mounted) return null;
  if (!open && !visible) return null;

  const isBottom = resolvedSide === "bottom";

  const panelBaseCls = [
    "fixed z-[70] bg-surface-3 border border-hairline",
    "shadow-[0_16px_48px_rgba(0,0,0,0.5)]",
    "motion-safe:transition-[transform,opacity] motion-safe:will-change-transform",
    "motion-safe:[transition-timing-function:var(--ease-out)]",
  ].join(" ");

  const panelSideCls = isBottom
    ? "left-0 right-0 bottom-0 max-h-[85dvh] pb-[env(safe-area-inset-bottom)] flex flex-col"
    : "top-0 right-0 h-full w-[420px] max-w-[90vw] flex flex-col";

  const panelStyle: React.CSSProperties = isBottom
    ? {
        borderTopLeftRadius: "var(--v2-radius-md, 10px)",
        borderTopRightRadius: "var(--v2-radius-md, 10px)",
        transform: visible
          ? `translateY(${dragY}px)`
          : "translateY(100%)",
        opacity: visible ? 1 : 0,
        transitionDuration: visible
          ? "var(--dur-slow)"
          : "var(--dur-base)",
      }
    : {
        transform: visible ? "translateX(0)" : "translateX(100%)",
        opacity: visible ? 1 : 0,
        transitionDuration: visible
          ? "var(--dur-slow)"
          : "var(--dur-base)",
      };

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[69] bg-black/50 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${panelBaseCls} ${panelSideCls}`}
        style={panelStyle}
      >
        {isBottom && (
          <div
            className="flex justify-center pt-2 pb-1 cursor-grab touch-none select-none"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          >
            <span
              aria-hidden
              className="block h-1 w-8 rounded-full bg-hairline-strong"
            />
          </div>
        )}
        {title && (
          <div className="px-6 pt-3 pb-2 text-sm font-[family-name:var(--font-fraunces)] text-text-hi">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </>,
    document.body,
  );
}
