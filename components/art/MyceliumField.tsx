"use client";

import { useEffect, useRef } from "react";
import { onFieldPulse } from "@/lib/motion";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";

type Node = {
  x: number;
  y: number;
  opacity: number;
  opacityTarget: number;
  tendrilX: number;
  tendrilY: number;
};

type Ripple = { x: number; y: number; startedAt: number };

const NODE_COUNT = 40;
const FRAME_INTERVAL_MS = 33; // ≈30fps throttle
const RIPPLE_DURATION_MS = 800;
const TENDRIL_LERP = 0.05;
const OPACITY_LERP = 0.005;

/**
 * Ambient reactive background — see the P5 spec.
 * - Dormant nodes on a jittered layout, slow opacity drift.
 * - Nearest-3 nodes grow a laggy tendril toward the desktop cursor.
 * - Capture success emits a ripple via triggerFieldPulse().
 * - Paused on document.hidden. Single static frame under motion:"off"
 *   or prefers-reduced-motion.
 */
export function MyceliumField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { prefs } = useUiPrefs();
  const motion = prefs.motion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const stillOnly = motion === "off" || reduceMotion;

    // Re-narrow across the closure boundary — TS drops the non-null
    // narrowing when a variable is captured by a nested function.
    const cvs = canvas;
    const ctx2d = ctx;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      cvs.width = Math.round(width * dpr);
      cvs.height = Math.round(height * dpr);
      cvs.style.width = width + "px";
      cvs.style.height = height + "px";
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const nodes: Node[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      nodes.push({
        x,
        y,
        opacity: 0.15 + Math.random() * 0.15,
        opacityTarget: 0.15 + Math.random() * 0.15,
        tendrilX: x,
        tendrilY: y,
      });
    }

    // Precompute nearest-neighbor edges once. Nodes don't move.
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < nodes.length; i++) {
      let closest = -1;
      let best = Infinity;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          closest = j;
        }
      }
      if (closest >= 0) edges.push([i, closest]);
    }

    let pointerX = -1000;
    let pointerY = -1000;
    let hasPointer = false;
    let ripples: Ripple[] = [];

    function drawEdges() {
      ctx2d.strokeStyle = "rgba(232,230,221,0.05)";
      ctx2d.lineWidth = 0.5;
      for (const [a, b] of edges) {
        ctx2d.beginPath();
        ctx2d.moveTo(nodes[a].x, nodes[a].y);
        ctx2d.lineTo(nodes[b].x, nodes[b].y);
        ctx2d.stroke();
      }
    }

    function drawNodes() {
      for (const n of nodes) {
        ctx2d.fillStyle = `rgba(232,230,221,${n.opacity.toFixed(3)})`;
        ctx2d.beginPath();
        ctx2d.arc(n.x, n.y, 1.3, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    function drawStaticFrame() {
      ctx2d.clearRect(0, 0, width, height);
      drawEdges();
      drawNodes();
    }

    if (stillOnly) {
      drawStaticFrame();
      function onResize() {
        resize();
        drawStaticFrame();
      }
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    function draw(now: number) {
      ctx2d.clearRect(0, 0, width, height);
      drawEdges();

      // Ripples
      for (const r of ripples) {
        const t = (now - r.startedAt) / RIPPLE_DURATION_MS;
        if (t > 1) continue;
        const radius = t * 260;
        const alpha = (1 - t) * 0.15;
        ctx2d.strokeStyle = `rgba(132,245,184,${alpha.toFixed(3)})`;
        ctx2d.lineWidth = 1.5;
        ctx2d.beginPath();
        ctx2d.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx2d.stroke();
      }
      ripples = ripples.filter((r) => now - r.startedAt < RIPPLE_DURATION_MS);

      // Pointer tendrils (desktop only). Nearest 3 nodes.
      if (!isTouch && hasPointer) {
        const withDist: { i: number; d: number }[] = [];
        for (let i = 0; i < nodes.length; i++) {
          const dx = nodes[i].x - pointerX;
          const dy = nodes[i].y - pointerY;
          withDist.push({ i, d: dx * dx + dy * dy });
        }
        withDist.sort((a, b) => a.d - b.d);
        for (let k = 0; k < 3 && k < withDist.length; k++) {
          const n = nodes[withDist[k].i];
          n.tendrilX += (pointerX - n.tendrilX) * TENDRIL_LERP;
          n.tendrilY += (pointerY - n.tendrilY) * TENDRIL_LERP;
          ctx2d.strokeStyle = "rgba(132,245,184,0.15)";
          ctx2d.lineWidth = 0.5;
          ctx2d.beginPath();
          ctx2d.moveTo(n.x, n.y);
          ctx2d.lineTo(n.tendrilX, n.tendrilY);
          ctx2d.stroke();
        }
      }

      // Drift opacity toward per-node target; retarget when close.
      for (const n of nodes) {
        n.opacity += (n.opacityTarget - n.opacity) * OPACITY_LERP;
        if (Math.abs(n.opacity - n.opacityTarget) < 0.005) {
          n.opacityTarget = 0.15 + Math.random() * 0.15;
        }
      }
      drawNodes();
    }

    let raf = 0;
    let lastFrame = 0;
    let paused = false;

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      if (now - lastFrame < FRAME_INTERVAL_MS) return;
      lastFrame = now;
      draw(now);
    }

    function onPointerMove(e: PointerEvent) {
      pointerX = e.clientX;
      pointerY = e.clientY;
      hasPointer = true;
    }
    function onPointerLeave() {
      hasPointer = false;
    }
    function onVisibility() {
      paused = document.hidden;
    }
    function onResize() {
      resize();
    }

    if (!isTouch) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    const unsubPulse = onFieldPulse(({ x, y }) => {
      ripples.push({ x, y, startedAt: performance.now() });
    });

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      unsubPulse();
    };
  }, [motion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
