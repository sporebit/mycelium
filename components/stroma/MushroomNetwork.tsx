"use client";

import { useEffect, useRef } from "react";

/**
 * Interactive mushroom-silhouette node network rendered to a full-viewport
 * canvas. ~400 nodes are placed by rejection sampling against a density
 * function approximating a fruiting body — dense cap, narrower stem, root
 * flare at the base, sparse scatter outside.
 *
 * Each node has a home position and gravitates back toward it via a spring
 * force; nodes within REPEL_RADIUS of the cursor are pushed away. Nearby
 * nodes are connected with hairline strokes whose alpha decays with
 * distance. The central "fruiting body" pulses on top.
 *
 * prefers-reduced-motion: skips the rAF loop and renders a static frame.
 */

type Node = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  r: number;
};

const NODE_COUNT = 400;
const CONNECT_RADIUS = 55;
const CONNECT_RADIUS_SQ = CONNECT_RADIUS * CONNECT_RADIUS;
const REPEL_RADIUS = 120;
const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
const SPRING_K = 0.015;
const DAMPING = 0.88;

/** Returns a density 0..1 saying how likely a point at (x, y) is to host
 *  a node. Combines a dome-shaped cap region, a flared stem, and a low
 *  background scatter outside both. */
function densityAt(x: number, y: number, W: number, H: number): number {
  const capCx = W * 0.5;
  const capCy = H * 0.5;
  const capRx = W * 0.3;
  const capRy = H * 0.16;

  const stemTopY = H * 0.5;
  const stemBotY = H * 0.85;
  const stemHalfTop = W * 0.075;
  const stemHalfBot = W * 0.1;

  // Cap dome — upper portion of an ellipse. The y-cutoff stops the
  // ellipse from creating density underneath where the stem already is.
  if (y < capCy + capRy * 0.7) {
    const dx = (x - capCx) / capRx;
    const dy = (y - capCy) / capRy;
    const e = dx * dx + dy * dy;
    if (e < 0.7) return 1.0;
    if (e < 1.0) return 0.6;
  }

  // Stem — vertical band whose half-width interpolates from the top
  // value to the wider base value. The t² eases the flare to land
  // mostly at the bottom so the upper stem stays narrow.
  if (y >= stemTopY && y <= stemBotY) {
    const t = (y - stemTopY) / (stemBotY - stemTopY);
    const halfW = stemHalfTop + (stemHalfBot - stemHalfTop) * t * t;
    const ax = Math.abs(x - capCx);
    if (ax < halfW * 0.7) return 0.9;
    if (ax < halfW) return 0.55;
  }

  // Sparse scatter beyond the silhouette.
  return 0.05;
}

/** Generate home positions for `count` nodes via rejection sampling. */
function generateHomePositions(
  count: number,
  W: number,
  H: number,
  rng: () => number,
): Array<{ ox: number; oy: number; r: number }> {
  const out: Array<{ ox: number; oy: number; r: number }> = [];
  let attempts = 0;
  const maxAttempts = count * 80;
  while (out.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = rng() * W;
    const y = rng() * H;
    const p = densityAt(x, y, W, H);
    if (rng() < p) {
      // Larger nodes inside the dense cap, smaller in the scatter.
      const r = 0.8 + rng() * 1.4;
      out.push({ ox: x, oy: y, r });
    }
  }
  return out;
}

function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function MushroomNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = mulberry32(0xb1e57e7);
    let W = window.innerWidth;
    let H = window.innerHeight;
    let dpr = window.devicePixelRatio || 1;

    const nodes: Node[] = [];

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.floor(W * dpr);
      canvas!.height = Math.floor(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedNodes() {
      const homes = generateHomePositions(NODE_COUNT, W, H, rng);
      nodes.length = 0;
      for (const h of homes) {
        nodes.push({
          x: h.ox,
          y: h.oy,
          ox: h.ox,
          oy: h.oy,
          vx: 0,
          vy: 0,
          r: h.r,
        });
      }
    }

    function recomputeHomes() {
      // Recompute home positions for the existing nodes from the new
      // viewport dimensions. Reuses the rng deterministically so node
      // identity is preserved between resizes.
      const localRng = mulberry32(0xb1e57e7);
      const homes = generateHomePositions(nodes.length, W, H, localRng);
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].ox = homes[i]?.ox ?? nodes[i].ox;
        nodes[i].oy = homes[i]?.oy ?? nodes[i].oy;
        nodes[i].r = homes[i]?.r ?? nodes[i].r;
      }
    }

    resize();
    seedNodes();

    let cursorX = -9999;
    let cursorY = -9999;

    function onMouseMove(e: MouseEvent) {
      cursorX = e.clientX;
      cursorY = e.clientY;
    }
    function onMouseLeave() {
      cursorX = -9999;
      cursorY = -9999;
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches[0]) {
        cursorX = e.touches[0].clientX;
        cursorY = e.touches[0].clientY;
      }
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onMouseLeave);

    let resizeRaf = 0;
    function onResize() {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resize();
        recomputeHomes();
      });
    }
    window.addEventListener("resize", onResize);

    /** Draw the central glowing fruiting-body node on top of everything.
     *  Pulse is driven by the elapsed time so it's continuous across
     *  frames without per-node bookkeeping. */
    function drawCentralSource(t: number) {
      if (!ctx) return;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const pulse = reduced
        ? 1.0
        : 1.075 + 0.075 * Math.sin((t / 3000) * Math.PI * 2);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);

      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(132,245,184,0.06)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(132,245,184,0.15)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(132,245,184,0.4)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();

      ctx.restore();
    }

    function drawConnections() {
      if (!ctx) return;
      ctx.lineWidth = 0.5;
      // O(n²) but ~80k comparisons at 400 nodes — well under budget on
      // modern hardware. Strokes are batched per pair; alpha is encoded
      // in the strokeStyle string each line.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > CONNECT_RADIUS_SQ) continue;
          const d = Math.sqrt(d2);
          const alpha = (1 - d / CONNECT_RADIUS) * 0.45;
          ctx.strokeStyle = `rgba(232,230,221,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    function drawNodes() {
      if (!ctx) return;
      ctx.fillStyle = "rgba(232,230,221,0.75)";
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function step() {
      // Physics: cursor repel + spring back to home + damping.
      for (const n of nodes) {
        const dx = n.x - cursorX;
        const dy = n.y - cursorY;
        const d2 = dx * dx + dy * dy;
        if (d2 < REPEL_RADIUS_SQ && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const force = ((REPEL_RADIUS - d) / REPEL_RADIUS) * 4.0;
          n.vx += (dx / d) * force;
          n.vy += (dy / d) * force;
        }
        n.vx += (n.ox - n.x) * SPRING_K;
        n.vy += (n.oy - n.y) * SPRING_K;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    let rafId = 0;
    let firstFrame = true;
    function frame(t: number) {
      if (firstFrame) {
        if (
          typeof window !== "undefined" &&
          window.location?.hostname === "localhost"
        ) {
          console.log("[MushroomNetwork] first frame", {
            t,
            nodes: nodes.length,
            W,
            H,
            reduced,
          });
        }
        firstFrame = false;
      }
      ctx!.clearRect(0, 0, W, H);
      step();
      drawConnections();
      drawNodes();
      drawCentralSource(t);
      rafId = requestAnimationFrame(frame);
    }

    function staticFrame() {
      ctx!.clearRect(0, 0, W, H);
      drawConnections();
      drawNodes();
      drawCentralSource(0);
    }

    if (reduced) {
      // Render once; redo on resize.
      staticFrame();
      const reducedResize = () => {
        resize();
        recomputeHomes();
        staticFrame();
      };
      window.addEventListener("resize", reducedResize);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseleave", onMouseLeave);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onMouseLeave);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("resize", reducedResize);
      };
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
