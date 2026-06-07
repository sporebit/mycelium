"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "@/lib/context/TransitionContext";

const SECTIONS = [
  { key: "dashboard", label: "DASHBOARD", colour: "#e8e6dd", route: "/dashboard", angle: 0 },
  { key: "finance", label: "FINANCE", colour: "#6db8f5", route: "/finance", angle: 60 },
  { key: "health", label: "HEALTH", colour: "#5de8e0", route: "/health", angle: 120 },
  { key: "organisation", label: "ORGANISATION", colour: "#f5b56d", route: "/compost", angle: 180 },
  { key: "studio", label: "STUDIO", colour: "#f56db5", route: "/studio", angle: 240 },
  { key: "fitness", label: "FITNESS", colour: "#84f5b8", route: "/fitness", angle: 300 },
] as const;

const BG = "#0e1410";
const BRAIN_COLOUR = "#84f5b8";
const MONO_FONT = '"Berkeley Mono", monospace';

type NodeState = { haloAlpha: number; ghostAlpha: number; nucleusAlpha: number };

type BrainGeo = {
  outer: { angle: number; rMul: number }[];
  inner: { angle: number; rMul: number }[];
  crossAngles: [number, number, number][];
  tendrils: { angle: number; lenMul: number; cpOff: number }[];
  junctions: { angle: number; distMul: number; r: number; alpha: number }[];
};

function generateBrainGeo(): BrainGeo {
  const outer: BrainGeo["outer"] = [];
  for (let i = 0; i < 10; i++) {
    const base = (i / 10) * Math.PI * 2;
    const angle = base + (Math.random() - 0.5) * 0.5;
    const rMul = 0.8 + Math.random() * 0.45;
    outer.push({ angle, rMul });
  }

  const inner: BrainGeo["inner"] = [];
  for (let i = 0; i < 7; i++) {
    const base = (i / 7) * Math.PI * 2;
    const angle = base + (Math.random() - 0.5) * 0.5;
    const rMul = 0.8 + Math.random() * 0.45;
    inner.push({ angle, rMul });
  }

  const crossAngles: [number, number, number][] = [
    [-Math.PI / 2, Math.PI / 2, 0.3],
    [Math.PI, 0, -0.25],
    [-Math.PI / 4 - 0.2, Math.PI * 3 / 4 - 0.2, 0.28],
    [Math.PI / 4 + 0.15, -Math.PI * 3 / 4 + 0.15, -0.22],
  ];

  const tendrils: BrainGeo["tendrils"] = [];
  const tendrilBaseAngles = [0.3, 1.1, 2.3, 3.5, 5.0];
  for (const a of tendrilBaseAngles) {
    tendrils.push({
      angle: a + (Math.random() - 0.5) * 0.3,
      lenMul: 0.5,
      cpOff: (Math.random() - 0.5) * 8,
    });
  }

  const junctions: BrainGeo["junctions"] = [];
  for (let i = 0; i < 11; i++) {
    junctions.push({
      angle: Math.random() * Math.PI * 2,
      distMul: 0.15 + Math.random() * 0.75,
      r: 1.2 + Math.random() * 1.0,
      alpha: 0.35 + Math.random() * 0.17,
    });
  }

  return { outer, inner, crossAngles, tendrils, junctions };
}

export function CanvasHub() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const { bloom } = useTransition();
  const [ready, setReady] = useState(false);

  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const hoveredRef = useRef<number>(-1);
  const navigatingRef = useRef(false);
  const nodeStates = useRef<NodeState[]>(
    SECTIONS.map(() => ({ haloAlpha: 0.04, ghostAlpha: 0.18, nucleusAlpha: 0.7 })),
  );
  const brainGeoRef = useRef<BrainGeo | null>(null);
  const rafRef = useRef<number>(0);

  const navigateToSection = useCallback(
    async (sectionIndex: number, originX: number, originY: number) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      const s = SECTIONS[sectionIndex];
      await bloom({
        colour: s.colour,
        originX,
        originY,
        direction: "enter",
      });
      router.push(s.route);
      navigatingRef.current = false;
    },
    [bloom, router],
  );

  const navigateToBrain = useCallback(
    async (originX: number, originY: number) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      await bloom({
        colour: BRAIN_COLOUR,
        originX,
        originY,
        direction: "enter",
      });
      router.push("/stroma");
      navigatingRef.current = false;
    },
    [bloom, router],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!brainGeoRef.current) {
      brainGeoRef.current = generateBrainGeo();
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      generateGrain(w, h);
    }

    function generateGrain(w: number, h: number) {
      const dpr = window.devicePixelRatio || 1;
      const offscreen = document.createElement("canvas");
      offscreen.width = w * dpr;
      offscreen.height = h * dpr;
      const gCtx = offscreen.getContext("2d");
      if (!gCtx) return;
      gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor(w * h * 0.02);
      for (let i = 0; i < count; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        const alpha = 0.06 + Math.random() * 0.08;
        gCtx.beginPath();
        gCtx.arc(gx, gy, 0.6, 0, Math.PI * 2);
        gCtx.fillStyle = `rgba(138,158,136,${alpha})`;
        gCtx.fill();
      }
      grainRef.current = offscreen;
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(document.documentElement);
    resize();
    setReady(true);

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    function handleMouseLeave() {
      mouseRef.current = { x: -9999, y: -9999 };
    }
    function handleClick() {
      const idx = hoveredRef.current;
      if (idx === -1) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (idx === -2) {
        navigateToBrain(w / 2, h / 2);
        return;
      }
      const orbitR = Math.min(w, h) * 0.32;
      const s = SECTIONS[idx];
      const rad = (s.angle * Math.PI) / 180;
      const nx = w / 2 + orbitR * Math.sin(rad);
      const ny = h / 2 - orbitR * Math.cos(rad);
      navigateToSection(idx, nx, ny);
    }
    function handleTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cxC = w / 2;
      const cyC = h / 2;
      const orbitR = Math.min(w, h) * 0.32;
      const nodeR = Math.min(w, h) * 0.022;
      for (let i = 0; i < SECTIONS.length; i++) {
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const nx = cxC + orbitR * Math.sin(rad);
        const ny = cyC - orbitR * Math.cos(rad);
        const dx = t.clientX - nx;
        const dy = t.clientY - ny;
        if (Math.sqrt(dx * dx + dy * dy) < nodeR * 2.5) {
          navigateToSection(i, t.clientX, t.clientY);
          return;
        }
      }
      if (Math.hypot(t.clientX - cxC, t.clientY - cyC) < 58) {
        navigateToBrain(t.clientX, t.clientY);
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function bezierPt(
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

    function bezierTangent(
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

    function draw(time: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const orbitR = Math.min(w, h) * 0.32;
      const nodeR = Math.min(w, h) * 0.022;
      const clusterR = orbitR * 0.15;
      const geo = brainGeoRef.current!;

      ctx!.clearRect(0, 0, w, h);

      // === 1. Background ===
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, w, h);

      if (grainRef.current) {
        ctx!.drawImage(grainRef.current, 0, 0, w, h);
      }

      ctx!.save();
      ctx!.globalAlpha = 0.04;
      ctx!.strokeStyle = "#8a9e88";
      ctx!.lineWidth = 0.5;
      const strataYs = [cy * 0.25, cy * 0.55, cy * 0.75];
      for (const sy of strataYs) {
        ctx!.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const yv = sy + Math.sin((x / 340) * Math.PI * 2) * 4;
          if (x === 0) ctx!.moveTo(x, yv);
          else ctx!.lineTo(x, yv);
        }
        ctx!.stroke();
      }
      ctx!.restore();

      // === 2. Atmospheric rings ===
      ctx!.save();
      ctx!.globalAlpha = 0.04;
      ctx!.strokeStyle = "#e8e6dd";
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      ctx!.ellipse(cx + 4, cy - 2, w * 0.38, h * 0.42, 0, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.ellipse(cx + 4, cy - 2, w * 0.32, h * 0.36, 0, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();

      // === 3. Growing threads ===
      for (let i = 0; i < SECTIONS.length; i++) {
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const nx = cx + orbitR * Math.sin(rad);
        const ny = cy - orbitR * Math.cos(rad);
        const startX = cx + clusterR * Math.sin(rad);
        const startY = cy - clusterR * Math.cos(rad);
        const midX = (startX + nx) / 2;
        const midY = (startY + ny) / 2;
        const perpX = -(ny - startY);
        const perpY = nx - startX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        const cpx = midX + (perpX / perpLen) * orbitR * 0.14;
        const cpy = midY + (perpY / perpLen) * orbitR * 0.14;

        // a) Ghost guide
        ctx!.save();
        ctx!.globalAlpha = 0.07;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.6;
        ctx!.beginPath();
        ctx!.moveTo(startX, startY);
        ctx!.quadraticCurveTo(cpx, cpy, nx, ny);
        ctx!.stroke();
        ctx!.restore();

        const growT = ((time / 5000 + i * 0.18) % 1);

        // e) Glow simulation (beneath the growing front)
        ctx!.save();
        ctx!.globalAlpha = 0.03;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 4;
        ctx!.beginPath();
        ctx!.moveTo(startX, startY);
        for (let dt = 0.02; dt <= growT; dt += 0.02) {
          const p = bezierPt(startX, startY, cpx, cpy, nx, ny, dt);
          ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
        ctx!.restore();

        // b) Growing front
        ctx!.save();
        ctx!.globalAlpha = 0.55;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.8;
        ctx!.beginPath();
        ctx!.moveTo(startX, startY);
        for (let dt = 0.02; dt <= growT; dt += 0.02) {
          const p = bezierPt(startX, startY, cpx, cpy, nx, ny, dt);
          ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
        ctx!.restore();

        // c) Growing tip
        const tip = bezierPt(startX, startY, cpx, cpy, nx, ny, growT);
        ctx!.save();
        ctx!.globalAlpha = 0.15;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
        ctx!.save();
        ctx!.globalAlpha = 0.85;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        // d) Secondary branch at t=0.55
        if (growT > 0.55) {
          const branchBase = bezierPt(startX, startY, cpx, cpy, nx, ny, 0.55);
          const tang = bezierTangent(startX, startY, cpx, cpy, nx, ny, 0.55);
          const tLen = Math.sqrt(tang.x * tang.x + tang.y * tang.y) || 1;
          const branchLen = orbitR * 0.06;
          const bex = branchBase.x + (-tang.y / tLen) * branchLen;
          const bey = branchBase.y + (tang.x / tLen) * branchLen;
          const branchProgress = Math.min((growT - 0.55) / 0.45, 1);
          const bpx = branchBase.x + (bex - branchBase.x) * branchProgress;
          const bpy = branchBase.y + (bey - branchBase.y) * branchProgress;

          ctx!.save();
          ctx!.globalAlpha = 0.2;
          ctx!.strokeStyle = s.colour;
          ctx!.lineWidth = 0.3;
          ctx!.beginPath();
          ctx!.moveTo(branchBase.x, branchBase.y);
          ctx!.lineTo(bpx, bpy);
          ctx!.stroke();
          ctx!.restore();
        }
      }

      // === 4. Brain cluster ===
      drawBrainCluster(ctx!, cx, cy, clusterR, time, geo);

      // === 5. Section nodes ===
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let newHovered = -1;

      for (let i = 0; i < SECTIONS.length; i++) {
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const nx = cx + orbitR * Math.sin(rad);
        const ny = cy - orbitR * Math.cos(rad);
        const dx = mx - nx;
        const dy = my - ny;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isHovered = dist < nodeR * 2.5;
        if (isHovered) newHovered = i;

        const ns = nodeStates.current[i];
        ns.haloAlpha = lerp(ns.haloAlpha, isHovered ? 0.1 : 0.04, 0.12);
        ns.ghostAlpha = lerp(ns.ghostAlpha, isHovered ? 0.35 : 0.18, 0.12);
        ns.nucleusAlpha = lerp(ns.nucleusAlpha, isHovered ? 1.0 : 0.7, 0.12);

        // a) Outer glow halo
        ctx!.save();
        ctx!.globalAlpha = ns.haloAlpha;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR * 1.8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        // b) Ghost ring
        ctx!.save();
        ctx!.globalAlpha = ns.ghostAlpha;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.5;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR * 1.1, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();

        // c) Inner nucleus
        ctx!.save();
        ctx!.globalAlpha = ns.nucleusAlpha;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR * 0.32, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      if (newHovered < 0 && Math.hypot(mx - cx, my - cy) < 58) {
        newHovered = -2;
      }
      hoveredRef.current = newHovered;
      canvas!.style.cursor = newHovered !== -1 ? "pointer" : "default";

      // === 6. Labels ===
      ctx!.save();
      ctx!.font = `11px ${MONO_FONT}`;
      for (let i = 0; i < SECTIONS.length; i++) {
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const nx = cx + orbitR * Math.sin(rad);
        const ny = cy - orbitR * Math.cos(rad);
        const dirX = Math.sin(rad);
        const dirY = -Math.cos(rad);
        const lx = nx + dirX * nodeR * 2.8;
        const ly = ny + dirY * nodeR * 2.8;

        ctx!.fillStyle = s.colour;
        ctx!.globalAlpha = 0.85;

        if (s.angle === 0 || s.angle === 180) {
          ctx!.textAlign = "center";
        } else if (s.angle > 180) {
          ctx!.textAlign = "right";
        } else {
          ctx!.textAlign = "left";
        }
        ctx!.textBaseline = "middle";

        drawSpacedText(ctx!, s.label, lx, ly, 3);
      }

      ctx!.globalAlpha = 0.28;
      ctx!.fillStyle = BRAIN_COLOUR;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      drawSpacedText(ctx!, "MYCELIUM", cx, 42, 5);

      ctx!.restore();

      // BRAIN label — drawn last so it sits on top
      ctx!.save();
      ctx!.font = `13px ${MONO_FONT}`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillStyle = BRAIN_COLOUR;
      ctx!.globalAlpha = 0.72;
      ctx!.fillText("BRAIN", cx, cy + 16);
      ctx!.restore();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("touchstart", handleTouch);
    };
  }, [navigateToSection, navigateToBrain]);

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

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  const chars = text.split("");
  const totalWidth =
    chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) +
    spacing * (chars.length - 1);

  let startX: number;
  if (ctx.textAlign === "center") {
    startX = x - totalWidth / 2;
  } else if (ctx.textAlign === "right") {
    startX = x - totalWidth;
  } else {
    startX = x;
  }

  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let curX = startX;
  for (const ch of chars) {
    ctx.fillText(ch, curX, y);
    curX += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = savedAlign;
}

function drawBrainCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  clusterR: number,
  time: number,
  geo: BrainGeo,
) {
  // Compute outer loop points with breathing
  const outerPts: [number, number][] = geo.outer.map((p, i) => {
    const breath = Math.sin(time * 0.0004 + i * 0.7) * 3;
    const r = clusterR * p.rMul;
    return [cx + Math.cos(p.angle) * r + breath, cy + Math.sin(p.angle) * r];
  });

  // a) Outer loop
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = BRAIN_COLOUR;
  ctx.lineWidth = 0.55;
  drawClosedCurve(ctx, outerPts);
  ctx.restore();

  // Compute inner loop points with breathing
  const innerR = clusterR * 0.6;
  const innerPts: [number, number][] = geo.inner.map((p, i) => {
    const breath = Math.sin(time * 0.0004 + i * 0.7 + 2) * 3;
    const r = innerR * p.rMul;
    return [cx + Math.cos(p.angle) * r + breath, cy + Math.sin(p.angle) * r];
  });

  // b) Inner loop
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = BRAIN_COLOUR;
  ctx.lineWidth = 0.48;
  drawClosedCurve(ctx, innerPts);
  ctx.restore();

  // c) 4 crossing threads
  for (const [startA, endA, cpMul] of geo.crossAngles) {
    const sx = cx + Math.cos(startA) * clusterR;
    const sy = cy + Math.sin(startA) * clusterR;
    const ex = cx + Math.cos(endA) * clusterR;
    const ey = cy + Math.sin(endA) * clusterR;
    const perpX = -(ey - sy);
    const perpY = ex - sx;
    const pLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    const cpx = (sx + ex) / 2 + (perpX / pLen) * clusterR * cpMul;
    const cpy = (sy + ey) / 2 + (perpY / pLen) * clusterR * cpMul;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = BRAIN_COLOUR;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // d) 5 dangling tendrils
  for (const t of geo.tendrils) {
    const sx = cx + Math.cos(t.angle) * clusterR;
    const sy = cy + Math.sin(t.angle) * clusterR;
    const ex = cx + Math.cos(t.angle) * (clusterR + clusterR * t.lenMul);
    const ey = cy + Math.sin(t.angle) * (clusterR + clusterR * t.lenMul);
    const cpx = (sx + ex) / 2 + t.cpOff;
    const cpy = (sy + ey) / 2 + t.cpOff;

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = BRAIN_COLOUR;
    ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // e) Junction nodes
  for (const j of geo.junctions) {
    const jx = cx + Math.cos(j.angle) * clusterR * j.distMul;
    const jy = cy + Math.sin(j.angle) * clusterR * j.distMul;
    ctx.save();
    ctx.globalAlpha = j.alpha;
    ctx.fillStyle = BRAIN_COLOUR;
    ctx.beginPath();
    ctx.arc(jx, jy, j.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // f) Nucleus
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = BRAIN_COLOUR;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClosedCurve(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
) {
  const n = points.length;
  if (n < 3) return;

  ctx.beginPath();
  const first = points[0];
  const second = points[1];
  ctx.moveTo((first[0] + second[0]) / 2, (first[1] + second[1]) / 2);

  for (let i = 1; i <= n; i++) {
    const p = points[i % n];
    const next = points[(i + 1) % n];
    const midX = (p[0] + next[0]) / 2;
    const midY = (p[1] + next[1]) / 2;
    ctx.quadraticCurveTo(p[0], p[1], midX, midY);
  }
  ctx.closePath();
  ctx.stroke();
}
