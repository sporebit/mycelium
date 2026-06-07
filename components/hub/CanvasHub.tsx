"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SECTIONS = [
  { key: "dashboard", label: "DASHBOARD", colour: "#e8e6dd", route: "/dashboard", angle: 0 },
  { key: "finance", label: "FINANCE", colour: "#6db8f5", route: "/finance", angle: 60 },
  { key: "health", label: "HEALTH", colour: "#5de8e0", route: "/health", angle: 120 },
  { key: "organisation", label: "ORGANISATION", colour: "#f5b56d", route: "/compost", angle: 180 },
  { key: "studio", label: "STUDIO", colour: "#f56db5", route: "/studio", angle: 240 },
  { key: "fitness", label: "FITNESS", colour: "#84f5b8", route: "/fitness", angle: 300 },
] as const;

const BG = "#0a0f0b";
const GLOW = "#84f5b8";
const MONO = '"Berkeley Mono", monospace';
const PIN_H = 14;
const RING_RADII = [8, 13, 19, 26, 33, 40, 47, 53, 59];
const BRAIN_HIT_R = 58;

type Seg = { x1: number; y1: number; x2: number; y2: number; th: number };

type ClickState = {
  idx: number;
  ox: number;
  oy: number;
  col: string;
  t0: number;
  route: string;
  done: boolean;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
function easeInCubic(t: number) {
  return t * t * t;
}

function qBezPt(
  x0: number, y0: number,
  cpx: number, cpy: number,
  x1: number, y1: number,
  t: number,
) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cpx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cpy + t * t * y1,
  };
}

function qBezTan(
  x0: number, y0: number,
  cpx: number, cpy: number,
  x1: number, y1: number,
  t: number,
) {
  const mt = 1 - t;
  return {
    x: 2 * mt * (cpx - x0) + 2 * t * (x1 - cpx),
    y: 2 * mt * (cpy - y0) + 2 * t * (y1 - cpy),
  };
}

function buildNetwork(
  cx: number,
  cy: number,
  oR: number,
  w: number,
  h: number,
): Seg[] {
  const r = mulberry32(42);
  const out: Seg[] = [];

  function go(
    x: number, y: number, a: number,
    l: number, th: number, d: number,
  ) {
    if (d === 0 || th < 0.22 || l < 1.8) return;
    let ex = x + Math.cos(a) * l;
    let ey = y + Math.sin(a) * l;
    ex = clamp(ex, 10, w - 10);
    ey = clamp(ey, 10, h - 10);
    if (Math.hypot(ex - x, ey - y) < 1.8) return;
    out.push({ x1: x, y1: y, x2: ex, y2: ey, th });
    const n = d > 4 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      go(
        ex, ey, a + (r() - 0.5) * 1.1,
        l * (0.6 + r() * 0.18), th * (0.64 + r() * 0.08), d - 1,
      );
    }
  }

  for (let i = 0; i < 10; i++) {
    const ba = (i / 10) * Math.PI * 2 + (r() - 0.5) * 0.5;
    go(cx, cy, ba, oR * 0.2, 2.4, 9);
  }

  out.sort((a, b) => b.th - a.th);
  return out;
}

function buildRings(): { angle: number; rMul: number }[][] {
  const r = mulberry32(7);
  return RING_RADII.map((_, ri) => {
    if (ri < 5) return [];
    const pts: { angle: number; rMul: number }[] = [];
    for (let i = 0; i < 14; i++) {
      pts.push({ angle: (i / 14) * Math.PI * 2, rMul: 0.78 + r() * 0.44 });
    }
    return pts;
  });
}

function buildPinThreads(seed: number): Seg[] {
  const r = mulberry32(seed);
  const out: Seg[] = [];
  function go(
    x: number, y: number, a: number,
    l: number, th: number, d: number,
  ) {
    if (d === 0 || th < 0.15 || l < 1) return;
    const ex = x + Math.cos(a) * l;
    const ey = y + Math.sin(a) * l;
    out.push({ x1: x, y1: y, x2: ex, y2: ey, th });
    for (let i = 0; i < 2; i++) {
      go(ex, ey, a + (r() - 0.5) * 1.4, l * 0.6, th * 0.6, d - 1);
    }
  }
  for (const a of [Math.PI * 0.35, Math.PI * 0.65, Math.PI * 0.15, Math.PI * 0.85]) {
    go(0, 0, a, 8, 0.6, 3);
  }
  return out;
}

function drawClosedCurve(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n];
    const nx = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  txt: string, x: number, y: number, sp: number,
) {
  const cs = txt.split("");
  const tw =
    cs.reduce((s, c) => s + ctx.measureText(c).width, 0) +
    sp * (cs.length - 1);
  let sx =
    ctx.textAlign === "center"
      ? x - tw / 2
      : ctx.textAlign === "right"
        ? x - tw
        : x;
  const saved = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of cs) {
    ctx.fillText(c, sx, y);
    sx += ctx.measureText(c).width + sp;
  }
  ctx.textAlign = saved;
}

function drawMushroomPin(
  ctx: CanvasRenderingContext2D,
  colour: string,
  scale: number,
  threads: Seg[],
  alpha: number,
) {
  const sH = PIN_H * 1.4 * scale;
  const sWb = PIN_H * 0.22 * scale;
  const sWt = PIN_H * 0.1 * scale;
  const cR = PIN_H * 0.42 * scale;
  const cB = cR * 1.25;

  for (const s of threads) {
    ctx.save();
    ctx.globalAlpha = 0.18 * alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = s.th;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(-sWb / 2, 0);
  ctx.lineTo(sWb / 2, 0);
  ctx.lineTo(sWt / 2, -sH);
  ctx.lineTo(-sWt / 2, -sH);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.6 * alpha;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-cR, -sH);
  ctx.bezierCurveTo(
    -cR * 1.05, -sH - cB * 0.6,
    -cR * 0.5, -sH - cB,
    0, -sH - cB,
  );
  ctx.bezierCurveTo(
    cR * 0.5, -sH - cB,
    cR * 1.05, -sH - cB * 0.6,
    cR, -sH,
  );
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.82 * alpha;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-cR * 0.9, -sH - cB * 0.15);
  ctx.bezierCurveTo(
    -cR * 0.4, -sH - cB * 0.95,
    cR * 0.4, -sH - cB * 0.95,
    cR * 0.9, -sH - cB * 0.15,
  );
  ctx.strokeStyle = colour;
  ctx.lineWidth = 0.4;
  ctx.globalAlpha = 0.35 * alpha;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -sH - cB * 0.55, cR * 1.7, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.06 * alpha;
  ctx.fill();
}

export function CanvasHub() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const hoveredRef = useRef(-1);
  const scalesRef = useRef(SECTIONS.map(() => 1.0));
  const netRef = useRef<Seg[] | null>(null);
  const ringsRef = useRef<{ angle: number; rMul: number }[][] | null>(null);
  const pinThrRef = useRef<Seg[][]>([]);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const bgOk = useRef(false);
  const mountT = useRef(0);
  const rafId = useRef(0);
  const clickSt = useRef<ClickState | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    mountT.current = performance.now();

    if (!ringsRef.current) ringsRef.current = buildRings();
    if (!pinThrRef.current.length) {
      pinThrRef.current = SECTIONS.map((_, i) => buildPinThreads(100 + i));
    }
    if (!bgRef.current) {
      const img = new Image();
      img.onload = () => {
        bgOk.current = true;
      };
      img.src = "/images/forest-bg.jpg";
      bgRef.current = img;
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      cvs!.width = w * dpr;
      cvs!.height = h * dpr;
      cvs!.style.width = `${w}px`;
      cvs!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const off = document.createElement("canvas");
      off.width = w * dpr;
      off.height = h * dpr;
      const g = off.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cnt = Math.floor(w * h * 0.02);
        for (let i = 0; i < cnt; i++) {
          g.beginPath();
          g.arc(Math.random() * w, Math.random() * h, 0.6, 0, Math.PI * 2);
          g.fillStyle = `rgba(138,158,136,${0.06 + Math.random() * 0.08})`;
          g.fill();
        }
        grainRef.current = off;
      }
      netRef.current = buildNetwork(
        w * 0.5, h * 0.55, Math.min(w, h) * 0.34, w, h,
      );
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(document.documentElement);
    resize();
    setReady(true);

    function onMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    function onLeave() {
      mouseRef.current = { x: -9999, y: -9999 };
    }

    function triggerClick(
      ox: number, oy: number, col: string, route: string, idx: number,
    ) {
      if (clickSt.current) return;
      clickSt.current = {
        idx, ox, oy, col, t0: performance.now(), route, done: false,
      };
    }

    function onClick() {
      const hov = hoveredRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w * 0.5;
      const cy = h * 0.55;
      if (hov >= 0) {
        const oR = Math.min(w, h) * 0.34;
        const rad = (SECTIONS[hov].angle * Math.PI) / 180;
        const px = cx + oR * Math.sin(rad);
        const py = cy - oR * Math.cos(rad);
        triggerClick(
          px, py - PIN_H * 0.7,
          SECTIONS[hov].colour, SECTIONS[hov].route, hov,
        );
      } else if (hov === -2) {
        triggerClick(cx, cy, GLOW, "/stroma", -1);
      }
    }

    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w * 0.5;
      const cy = h * 0.55;
      const oR = Math.min(w, h) * 0.34;
      for (let i = 0; i < SECTIONS.length; i++) {
        const rad = (SECTIONS[i].angle * Math.PI) / 180;
        const px = cx + oR * Math.sin(rad);
        const py = cy - oR * Math.cos(rad);
        const sH = PIN_H * 1.4;
        const cR = PIN_H * 0.42;
        if (
          Math.abs(t.clientX - px) < cR * 1.8 &&
          t.clientY - py > -sH * 1.3 &&
          t.clientY - py < cR
        ) {
          triggerClick(
            px, py - PIN_H * 0.7,
            SECTIONS[i].colour, SECTIONS[i].route, i,
          );
          return;
        }
      }
      if (Math.hypot(t.clientX - cx, t.clientY - cy) < BRAIN_HIT_R) {
        triggerClick(cx, cy, GLOW, "/stroma", -1);
      }
    }

    cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseleave", onLeave);
    cvs.addEventListener("click", onClick);
    cvs.addEventListener("touchstart", onTouch, { passive: true });

    function draw(time: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w * 0.5;
      const cy = h * 0.55;
      const oR = Math.min(w, h) * 0.34;
      const segs = netRef.current;
      const rings = ringsRef.current;
      const tsm = time - mountT.current;

      const bw = oR * 0.72;
      const bh = oR * 0.56;

      ctx!.clearRect(0, 0, w, h);

      // ── Background ──
      if (bgOk.current && bgRef.current) {
        ctx!.drawImage(bgRef.current, 0, 0, w, h);
      } else {
        ctx!.fillStyle = BG;
        ctx!.fillRect(0, 0, w, h);
        ctx!.save();
        ctx!.fillStyle = "#160e08";
        ctx!.beginPath();
        ctx!.ellipse(cx, cy * 1.1, w * 0.28, h * 0.14, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
      ctx!.fillStyle = "rgba(8,14,10,0.35)";
      ctx!.fillRect(0, 0, w, h);
      if (grainRef.current) ctx!.drawImage(grainRef.current, 0, 0, w, h);

      // Strata
      ctx!.save();
      ctx!.globalAlpha = 0.04;
      ctx!.strokeStyle = "#8a9e88";
      ctx!.lineWidth = 0.5;
      for (const sy of [cy * 0.25, cy * 0.55, cy * 0.75]) {
        ctx!.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const yv = sy + Math.sin((x / 340) * Math.PI * 2) * 4;
          if (x === 0) ctx!.moveTo(x, yv);
          else ctx!.lineTo(x, yv);
        }
        ctx!.stroke();
      }
      ctx!.restore();

      // ── Phase 1: Rings (400–900ms) ──
      const ringT = easeOutCubic(clamp((tsm - 400) / 500, 0, 1));
      if (rings && ringT > 0) {
        for (let ri = 0; ri < RING_RADII.length; ri++) {
          const baseR = RING_RADII[ri];
          const breath = Math.sin(time * 0.00035 + ri * 0.4) * 1.8;
          const drawR = (baseR + breath) * ringT;
          const opT = (baseR - 8) / (59 - 8);
          const alpha = (0.30 - opT * 0.20) * ringT;
          const lw = 1.0 - (ri / 8) * 0.7;

          ctx!.save();
          ctx!.globalAlpha = alpha;
          ctx!.strokeStyle = GLOW;
          ctx!.lineWidth = lw;

          const ring = rings[ri];
          if (ring.length === 0) {
            ctx!.beginPath();
            ctx!.arc(cx, cy, Math.max(0.1, drawR), 0, Math.PI * 2);
            ctx!.stroke();
          } else {
            const pts: [number, number][] = ring.map((p) => [
              cx + Math.cos(p.angle) * drawR * p.rMul,
              cy + Math.sin(p.angle) * drawR * p.rMul,
            ]);
            drawClosedCurve(ctx!, pts);
          }
          ctx!.restore();
        }
      }

      // ── Phase 3: L-system (1400–5500ms) ──
      const netT = easeOutCubic(clamp((tsm - 1400) / 4100, 0, 1));
      if (segs && netT > 0) {
        const vis = Math.floor(netT * segs.length);
        for (let si = 0; si < vis; si++) {
          const s = segs[si];
          const fl = 1 + Math.sin(time * 0.0005 + si * 0.06) * 0.08;
          ctx!.save();
          ctx!.globalAlpha = (s.th / 60) * fl;
          ctx!.strokeStyle = GLOW;
          ctx!.lineWidth = s.th * 3.5;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(s.x1, s.y1);
          ctx!.lineTo(s.x2, s.y2);
          ctx!.stroke();
          ctx!.restore();
          ctx!.save();
          ctx!.globalAlpha = Math.min(0.55, s.th / 2.0) * fl;
          ctx!.strokeStyle = GLOW;
          ctx!.lineWidth = s.th;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(s.x1, s.y1);
          ctx!.lineTo(s.x2, s.y2);
          ctx!.stroke();
          ctx!.restore();
        }
      }

      // ── Phase 2: Arterial threads (700–2400ms, staggered) ──
      for (let i = 0; i < SECTIONS.length; i++) {
        const aT = easeOutCubic(clamp((tsm - 700 - i * 180) / 1500, 0, 1));
        if (aT <= 0) continue;
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const sx = cx + bw * 0.44 * Math.sin(rad);
        const sy = cy - bh * 0.44 * Math.cos(rad);
        const ex = cx + oR * Math.sin(rad);
        const ey = cy - oR * Math.cos(rad);
        const mx2 = (sx + ex) / 2;
        const my2 = (sy + ey) / 2;
        const perpX = -(ey - sy);
        const perpY = ex - sx;
        const pLen = Math.hypot(perpX, perpY) || 1;
        const cpx = mx2 + (perpX / pLen) * oR * 0.05;
        const cpy = my2 + (perpY / pLen) * oR * 0.05;

        // a) Glow pass
        ctx!.save();
        ctx!.globalAlpha = 0.04;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 3.5;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(sx, sy);
        for (let dt = 0.02; dt <= aT; dt += 0.02) {
          const p = qBezPt(sx, sy, cpx, cpy, ex, ey, dt);
          ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
        ctx!.restore();

        // b) Trunk pass
        ctx!.save();
        ctx!.globalAlpha = 0.50;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 1.0;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(sx, sy);
        for (let dt = 0.02; dt <= aT; dt += 0.02) {
          const p = qBezPt(sx, sy, cpx, cpy, ex, ey, dt);
          ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
        ctx!.restore();

        // c) Side branches at t=0.35, 0.60, 0.80
        for (const bt of [0.35, 0.6, 0.8]) {
          if (aT < bt) continue;
          const bp = qBezPt(sx, sy, cpx, cpy, ex, ey, bt);
          const tn = qBezTan(sx, sy, cpx, cpy, ex, ey, bt);
          const ta = Math.atan2(tn.y, tn.x);
          const bLen = oR * 0.035;
          for (const sign of [-1, 1]) {
            const ba = ta + sign * 0.663;
            ctx!.save();
            ctx!.globalAlpha = 0.18;
            ctx!.strokeStyle = s.colour;
            ctx!.lineWidth = 0.35;
            ctx!.lineCap = "round";
            ctx!.beginPath();
            ctx!.moveTo(bp.x, bp.y);
            ctx!.lineTo(
              bp.x + Math.cos(ba) * bLen,
              bp.y + Math.sin(ba) * bLen,
            );
            ctx!.stroke();
            ctx!.restore();
          }
        }
      }

      // ── Phase 4: Mushroom pins + section labels (4200–5900ms) ──
      const pinOp = easeOutCubic(clamp((tsm - 4200) / 1700, 0, 1));
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let newHov = -1;

      for (let i = 0; i < SECTIONS.length; i++) {
        if (clickSt.current?.idx === i) continue;
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const px = cx + oR * Math.sin(rad);
        const py = cy - oR * Math.cos(rad);
        const sH = PIN_H * 1.4;
        const cR = PIN_H * 0.42;
        if (
          Math.abs(mx - px) < cR * 1.8 &&
          my - py > -sH * 1.3 &&
          my - py < cR
        ) {
          newHov = i;
        }
        const tgt = newHov === i ? 1.2 : 1.0;
        scalesRef.current[i] = lerp(scalesRef.current[i], tgt, 0.12);
        const sway = Math.sin(time * 0.00085 + i * 1.1) * 0.022;
        if (pinOp > 0) {
          ctx!.save();
          ctx!.translate(px, py);
          ctx!.rotate(sway);
          drawMushroomPin(
            ctx!, s.colour, scalesRef.current[i],
            pinThrRef.current[i] || [], pinOp,
          );
          ctx!.restore();
        }
      }

      // Brain hit test (after pin checks, only if no pin hovered)
      if (newHov < 0 && Math.hypot(mx - cx, my - cy) < BRAIN_HIT_R) {
        newHov = -2;
      }
      hoveredRef.current = newHov;
      cvs!.style.cursor = newHov !== -1 ? "pointer" : "default";

      // Section labels (gated with pinOp)
      if (pinOp > 0) {
        ctx!.save();
        ctx!.font = `11px ${MONO}`;
        for (let i = 0; i < SECTIONS.length; i++) {
          const s = SECTIONS[i];
          const rad = (s.angle * Math.PI) / 180;
          const px = cx + oR * Math.sin(rad);
          const py = cy - oR * Math.cos(rad);
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          ctx!.fillStyle = s.colour;
          ctx!.globalAlpha = 0.8 * pinOp;
          ctx!.textBaseline = "middle";
          if (s.angle === 0 || s.angle === 180) ctx!.textAlign = "center";
          else if (s.angle > 180) ctx!.textAlign = "right";
          else ctx!.textAlign = "left";
          drawSpacedText(
            ctx!, s.label,
            px + dx * PIN_H * 2.8, py + dy * PIN_H * 2.8, 3,
          );
        }
        ctx!.restore();
      }

      // ── Phase 5: BRAIN + MYCELIUM labels (5200–5900ms) ──
      const labelOp = easeOutCubic(clamp((tsm - 5200) / 700, 0, 1));
      if (labelOp > 0) {
        ctx!.save();
        ctx!.font = `13px ${MONO}`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillStyle = GLOW;
        ctx!.globalAlpha = 0.72 * labelOp;
        ctx!.fillText("BRAIN", cx, cy + 16);
        ctx!.restore();

        ctx!.save();
        ctx!.font = `11px ${MONO}`;
        ctx!.globalAlpha = 0.22 * labelOp;
        ctx!.fillStyle = GLOW;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "top";
        drawSpacedText(ctx!, "MYCELIUM", cx, 38, 5);
        ctx!.restore();
      }

      // ── Click animation ──
      const cl = clickSt.current;
      if (cl) {
        const elapsed = time - cl.t0;
        const prog = easeInOutCubic(clamp(elapsed / 1100, 0, 1));
        const sH = PIN_H * 1.4;
        const cR = PIN_H * 0.42;

        const t1 = clamp(prog / 0.32, 0, 1);
        const t2 = clamp((prog - 0.28) / 0.42, 0, 1);
        const t3 = clamp((prog - 0.62) / 0.38, 0, 1);

        const bSH = sH * (1 + t1 * 5.5);
        const bCR = cR * (1 + t1 * 5.0);
        const bCB = bCR * 1.25;
        const bSWb = PIN_H * 0.22 * (1 + t1 * 5.5);
        const bSWt = PIN_H * 0.1 * (1 + t1 * 5.5);
        const anim = Math.min(1, 0.8 + t1 * 0.2);

        ctx!.save();
        ctx!.translate(cl.ox, cl.oy + sH * 0.5);

        ctx!.beginPath();
        ctx!.moveTo(-bSWb / 2, 0);
        ctx!.lineTo(bSWb / 2, 0);
        ctx!.lineTo(bSWt / 2, -bSH);
        ctx!.lineTo(-bSWt / 2, -bSH);
        ctx!.closePath();
        ctx!.fillStyle = cl.col;
        ctx!.globalAlpha = 0.6 * anim;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.moveTo(-bCR, -bSH);
        ctx!.bezierCurveTo(
          -bCR * 1.05, -bSH - bCB * 0.6,
          -bCR * 0.5, -bSH - bCB,
          0, -bSH - bCB,
        );
        ctx!.bezierCurveTo(
          bCR * 0.5, -bSH - bCB,
          bCR * 1.05, -bSH - bCB * 0.6,
          bCR, -bSH,
        );
        ctx!.closePath();
        ctx!.fillStyle = cl.col;
        ctx!.globalAlpha = 0.82 * anim;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.moveTo(-bCR * 0.9, -bSH - bCB * 0.15);
        ctx!.bezierCurveTo(
          -bCR * 0.4, -bSH - bCB * 0.95,
          bCR * 0.4, -bSH - bCB * 0.95,
          bCR * 0.9, -bSH - bCB * 0.15,
        );
        ctx!.strokeStyle = cl.col;
        ctx!.lineWidth = 0.4;
        ctx!.globalAlpha = 0.35;
        ctx!.stroke();

        ctx!.restore();

        if (t2 > 0) {
          const maxR = Math.hypot(w, h) * 0.75;
          const fillR = bCR + maxR * easeInCubic(t2);
          const ccy = cl.oy - bSH - bCB * 0.55;
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(cl.ox, ccy, fillR, 0, Math.PI * 2);
          ctx!.fillStyle = cl.col;
          ctx!.globalAlpha = Math.min(1.0, 0.3 + t2 * 0.85);
          ctx!.fill();
          ctx!.restore();
        }

        if (t3 > 0) {
          const maxR = Math.hypot(w, h) * 0.75;
          const rng = mulberry32(cl.idx * 3 + 1);
          const cSegs: Seg[] = [];
          const cBr = (
            x: number, y: number, a: number,
            l: number, th: number, d: number,
          ) => {
            if (d === 0 || th < 0.2 || l < 2) return;
            const ex2 = x + Math.cos(a) * l;
            const ey2 = y + Math.sin(a) * l;
            cSegs.push({ x1: x, y1: y, x2: ex2, y2: ey2, th });
            for (let j = 0; j < 2; j++) {
              cBr(
                ex2, ey2, a + (rng() - 0.5) * 1.2,
                l * (0.55 + rng() * 0.2), th * 0.65, d - 1,
              );
            }
          };
          for (let i = 0; i < 12; i++) {
            cBr(
              cl.ox, cl.oy, (i / 12) * Math.PI * 2,
              maxR * 0.06 * t3, 1.4 * (1 - t3 * 0.7), 5,
            );
          }
          const fa = Math.max(0.05, 0.5 - t3 * 0.45);
          for (const seg of cSegs) {
            ctx!.save();
            ctx!.globalAlpha = fa;
            ctx!.strokeStyle = cl.col;
            ctx!.lineWidth = seg.th;
            ctx!.lineCap = "round";
            ctx!.beginPath();
            ctx!.moveTo(seg.x1, seg.y1);
            ctx!.lineTo(seg.x2, seg.y2);
            ctx!.stroke();
            ctx!.restore();
          }
        }

        if (prog >= 1.0 && !cl.done) {
          cl.done = true;
          router.push(cl.route);
        }
      }

      rafId.current = requestAnimationFrame(draw);
    }

    rafId.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId.current);
      ro.disconnect();
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      cvs.removeEventListener("click", onClick);
      cvs.removeEventListener("touchstart", onTouch);
    };
  }, [router]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 50,
        background: BG,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          opacity: ready ? 1 : 0,
          transition: "opacity 0.3s ease-in",
        }}
      />
    </div>
  );
}
