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

const BG = "#0e1410";
const BRAIN_COLOUR = "#84f5b8";
const MONO_FONT = '"Berkeley Mono", monospace';

type NodeState = { ghostR: number; nucleusAlpha: number; ghostAlpha: number };

export function CanvasHub() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const hoveredRef = useRef<number>(-1);
  const nodeStates = useRef<NodeState[]>(
    SECTIONS.map(() => ({ ghostR: 0, nucleusAlpha: 0.5, ghostAlpha: 0.16 })),
  );
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
      if (idx >= 0) router.push(SECTIONS[idx].route);
    }
    function handleTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      mouseRef.current = { x: t.clientX, y: t.clientY };
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cxC = w / 2;
      const cyC = h / 2;
      const orbitR = Math.min(w, h) * 0.32;
      const nodeR = Math.min(w, h) * 0.034;
      for (let i = 0; i < SECTIONS.length; i++) {
        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const nx = cxC + orbitR * Math.sin(rad);
        const ny = cyC - orbitR * Math.cos(rad);
        const dx = t.clientX - nx;
        const dy = t.clientY - ny;
        if (Math.sqrt(dx * dx + dy * dy) < nodeR * 1.6) {
          router.push(s.route);
          return;
        }
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function bezierPoint(
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

    function draw(time: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const orbitR = Math.min(w, h) * 0.32;
      const nodeR = Math.min(w, h) * 0.034;
      const clusterR = orbitR * 0.13;

      ctx!.clearRect(0, 0, w, h);

      // === 1. Background ===
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, w, h);

      // Grain
      if (grainRef.current) {
        ctx!.drawImage(grainRef.current, 0, 0, w, h);
      }

      // Strata lines
      ctx!.save();
      ctx!.globalAlpha = 0.04;
      ctx!.strokeStyle = "#8a9e88";
      ctx!.lineWidth = 0.5;
      const strataYs = [cy * 0.25, cy * 0.55, cy * 0.75];
      for (const sy of strataYs) {
        ctx!.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const yv = sy + Math.sin(x / 340 * Math.PI * 2) * 4;
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
      drawEllipse(ctx!, cx + 4, cy - 2, w * 0.38, h * 0.42);
      drawEllipse(ctx!, cx + 4, cy - 2, w * 0.32, h * 0.36);
      ctx!.restore();

      // === 3. Curved threads + spore dots ===
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
        const cpx = midX + (perpX / perpLen) * orbitR * 0.06;
        const cpy = midY + (perpY / perpLen) * orbitR * 0.06;

        ctx!.save();
        ctx!.globalAlpha = 0.24;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.7;
        ctx!.beginPath();
        ctx!.moveTo(startX, startY);
        ctx!.quadraticCurveTo(cpx, cpy, nx, ny);
        ctx!.stroke();
        ctx!.restore();

        // Spore dots
        for (let j = 0; j < 2; j++) {
          const t = ((time / 3000 + i * 0.4 + j * 0.5) % 1);
          const pt = bezierPoint(startX, startY, cpx, cpy, nx, ny, t);
          ctx!.save();
          ctx!.globalAlpha = j === 0 ? 0.4 : 0.3;
          ctx!.fillStyle = s.colour;
          ctx!.beginPath();
          ctx!.arc(pt.x, pt.y, j === 0 ? 1.5 : 1, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
      }

      // === 4. Brain organic cluster ===
      drawBrainCluster(ctx!, cx, cy, clusterR, time);

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
        const isHovered = dist < nodeR * 1.6;
        if (isHovered) newHovered = i;

        const ns = nodeStates.current[i];
        const targetGhostR = isHovered ? nodeR * 1.55 : nodeR * 1.36;
        const targetNucAlpha = isHovered ? 0.85 : 0.5;
        const targetGhostAlpha = isHovered ? 0.32 : 0.16;
        ns.ghostR = lerp(ns.ghostR || targetGhostR, targetGhostR, 0.12);
        ns.nucleusAlpha = lerp(ns.nucleusAlpha, targetNucAlpha, 0.12);
        ns.ghostAlpha = lerp(ns.ghostAlpha, targetGhostAlpha, 0.12);

        // Ghost ring
        ctx!.save();
        ctx!.globalAlpha = ns.ghostAlpha;
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.5;
        ctx!.beginPath();
        ctx!.arc(nx, ny, ns.ghostR, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();

        // Node circle
        ctx!.save();
        ctx!.globalAlpha = 0.12;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
        ctx!.save();
        ctx!.strokeStyle = s.colour;
        ctx!.lineWidth = 0.5;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();

        // Inner nucleus
        ctx!.save();
        ctx!.globalAlpha = ns.nucleusAlpha;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(nx, ny, nodeR * 0.4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      hoveredRef.current = newHovered;
      canvas!.style.cursor = newHovered >= 0 ? "pointer" : "default";

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
        const lx = nx + dirX * nodeR * 2.6;
        const ly = ny + dirY * nodeR * 2.6;

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

      // BRAIN label
      ctx!.globalAlpha = 0.38;
      ctx!.fillStyle = BRAIN_COLOUR;
      ctx!.textAlign = "right";
      ctx!.textBaseline = "middle";
      drawSpacedText(ctx!, "BRAIN", cx - clusterR * 2.2, cy, 3);

      // MYCELIUM wordmark
      ctx!.globalAlpha = 0.28;
      ctx!.fillStyle = BRAIN_COLOUR;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      drawSpacedText(ctx!, "MYCELIUM", cx, 42, 5);

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

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  const chars = text.split("");
  const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);

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
) {
  const breathe = Math.sin(time * 0.0004) * 3;

  // Control points for outer loop — 8 points in an irregular ellipse
  const outerPoints: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const vary = 0.8 + ((i * 7 + 3) % 5) / 5 * 0.4; // pseudo-random 0.8–1.2
    const r = clusterR * vary;
    const bx = i === 0 ? breathe : 0;
    outerPoints.push([cx + Math.cos(a) * r + bx, cy + Math.sin(a) * r]);
  }

  // a) Outer loop
  ctx.save();
  ctx.globalAlpha = 0.44;
  ctx.strokeStyle = BRAIN_COLOUR;
  ctx.lineWidth = 0.55;
  drawClosedCurve(ctx, outerPoints);
  ctx.restore();

  // b) Inner loop — smaller, slightly rotated
  const innerPoints: [number, number][] = [];
  const innerR = clusterR * 0.75;
  const rot = 0.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rot;
    const vary = 0.8 + ((i * 5 + 2) % 5) / 5 * 0.4;
    const r = innerR * vary;
    const bx = i === 4 ? breathe : 0;
    innerPoints.push([cx + Math.cos(a) * r + bx, cy + Math.sin(a) * r]);
  }

  ctx.save();
  ctx.globalAlpha = 0.37;
  ctx.strokeStyle = BRAIN_COLOUR;
  ctx.lineWidth = 0.48;
  drawClosedCurve(ctx, innerPoints);
  ctx.restore();

  // c) 4 crossing wavy lines through the centre
  const crossLines: { sx: number; sy: number; ex: number; ey: number; cpOff: number }[] = [
    { sx: cx, sy: cy - clusterR * 0.9, ex: cx, ey: cy + clusterR * 0.9, cpOff: 6 },
    { sx: cx - clusterR * 0.85, sy: cy, ex: cx + clusterR * 0.85, ey: cy, cpOff: -5 },
    { sx: cx - clusterR * 0.7, sy: cy - clusterR * 0.7, ex: cx + clusterR * 0.7, ey: cy + clusterR * 0.7, cpOff: 7 },
    { sx: cx + clusterR * 0.7, sy: cy - clusterR * 0.7, ex: cx - clusterR * 0.7, ey: cy + clusterR * 0.7, cpOff: -4 },
  ];

  const crossAlphas = [0.28, 0.32, 0.30, 0.29];
  for (let i = 0; i < crossLines.length; i++) {
    const cl = crossLines[i];
    ctx.save();
    ctx.globalAlpha = crossAlphas[i];
    ctx.strokeStyle = BRAIN_COLOUR;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(cl.sx, cl.sy);
    ctx.quadraticCurveTo(cx + cl.cpOff, cy + cl.cpOff, cl.ex, cl.ey);
    ctx.stroke();
    ctx.restore();
  }

  // d) 5 short dangling tendrils
  const tendrilAngles = [0.4, 1.3, 2.5, 3.7, 5.2];
  for (const ta of tendrilAngles) {
    const sx = cx + Math.cos(ta) * clusterR;
    const sy = cy + Math.sin(ta) * clusterR;
    const len = 15 + (ta * 3) % 10;
    const ex = cx + Math.cos(ta) * (clusterR + len);
    const ey = cy + Math.sin(ta) * (clusterR + len);
    const cpx = (sx + ex) / 2 + Math.sin(ta * 2) * 5;
    const cpy = (sy + ey) / 2 + Math.cos(ta * 2) * 5;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = BRAIN_COLOUR;
    ctx.lineWidth = 0.27;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // e) 8–10 small junction nodes
  const junctions: { x: number; y: number; r: number; a: number }[] = [
    { x: cx + 3, y: cy - 4, r: 1.8, a: 0.46 },
    { x: cx - 5, y: cy + 2, r: 1.5, a: 0.38 },
    { x: cx + 7, y: cy + 5, r: 1.3, a: 0.32 },
    { x: cx - 3, y: cy - 6, r: 2.0, a: 0.42 },
    { x: cx + 1, y: cy + 8, r: 1.4, a: 0.30 },
    { x: cx - 8, y: cy - 1, r: 1.6, a: 0.36 },
    { x: cx + 6, y: cy - 7, r: 1.3, a: 0.34 },
    { x: cx - 2, y: cy + 4, r: 1.7, a: 0.40 },
    { x: cx + 4, y: cy + 1, r: 1.4, a: 0.33 },
  ];

  for (const j of junctions) {
    ctx.save();
    ctx.globalAlpha = j.a;
    ctx.fillStyle = BRAIN_COLOUR;
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // f) Main nucleus
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = BRAIN_COLOUR;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClosedCurve(ctx: CanvasRenderingContext2D, points: [number, number][]) {
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
