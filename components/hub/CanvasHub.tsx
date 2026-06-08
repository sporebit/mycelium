"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "@/lib/context/TransitionContext";

const SECTIONS = [
  { key: "dashboard", label: "DASHBOARD", colour: "#e8e6dd", route: "/", angle: 0 },
  { key: "finance", label: "FINANCE", colour: "#6db8f5", route: "/finance", angle: 60 },
  { key: "health", label: "HEALTH", colour: "#5de8e0", route: "/health", angle: 120 },
  { key: "organisation", label: "ORGANISATION", colour: "#f5b56d", route: "/organisation", angle: 180 },
  { key: "studio", label: "STUDIO", colour: "#f56db5", route: "/studio", angle: 240 },
  { key: "fitness", label: "FITNESS", colour: "#84f5b8", route: "/fitness", angle: 300 },
] as const;

const BG = "#0a0f0b";
const GLOW = "#84f5b8";
const MONO = '"Berkeley Mono", monospace';

type Seg = { x1: number; y1: number; x2: number; y2: number; th: number };

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

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lerpColour(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
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


function buildBranch(
  cx: number, cy: number, maxR: number,
  count: number, startLen: number, startTh: number, depth: number,
  seed: number,
): Seg[] {
  const r = mulberry32(seed);
  const out: Seg[] = [];

  function go(x: number, y: number, a: number, l: number, th: number, d: number) {
    if (d === 0 || th < 0.15 || l < 1.2) return;
    let ex = x + Math.cos(a) * l;
    let ey = y + Math.sin(a) * l;
    const dist = Math.hypot(ex - cx, ey - cy);
    if (dist > maxR) {
      const scale = maxR / dist;
      ex = cx + (ex - cx) * scale;
      ey = cy + (ey - cy) * scale;
    }
    if (Math.hypot(ex - x, ey - y) < 1) return;
    out.push({ x1: x, y1: y, x2: ex, y2: ey, th });
    const n = d > 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      go(ex, ey, a + (r() - 0.5) * 1.1, l * (0.58 + r() * 0.18), th * (0.62 + r() * 0.1), d - 1);
    }
  }

  for (let i = 0; i < count; i++) {
    const ba = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.4;
    go(cx, cy, ba, startLen, startTh, depth);
  }

  out.sort((a, b) => b.th - a.th);
  return out;
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  txt: string, x: number, y: number, sp: number,
) {
  const cs = txt.split("");
  const tw = cs.reduce((s, c) => s + ctx.measureText(c).width, 0) + sp * (cs.length - 1);
  let sx = ctx.textAlign === "center" ? x - tw / 2 : ctx.textAlign === "right" ? x - tw : x;
  const saved = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of cs) {
    ctx.fillText(c, sx, y);
    sx += ctx.measureText(c).width + sp;
  }
  ctx.textAlign = saved;
}

export function CanvasHub() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const { bloom } = useTransition();
  const [ready, setReady] = useState(false);

  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const hoveredRef = useRef(-1);
  const scalesRef = useRef(SECTIONS.map(() => 1.0));
  const coreSegsRef = useRef<Seg[] | null>(null);
  const clusterSegsRef = useRef<Seg[][] | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const bgOk = useRef(false);
  const mountT = useRef(0);
  const rafId = useRef(0);
  const navigatingRef = useRef(false);

  const navigateToSection = useCallback(
    async (idx: number, originX: number, originY: number) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      await bloom({ colour: SECTIONS[idx].colour, originX, originY, direction: "enter" });
      router.push(SECTIONS[idx].route);
      navigatingRef.current = false;
    },
    [bloom, router],
  );

  const navigateToBrain = useCallback(
    async (originX: number, originY: number) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      await bloom({ colour: GLOW, originX, originY, direction: "enter" });
      router.push("/brain");
      navigatingRef.current = false;
    },
    [bloom, router],
  );

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    mountT.current = performance.now();

    if (!bgRef.current) {
      const img = new Image();
      img.onload = () => { bgOk.current = true; };
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

      const cxV = w * 0.5;
      const cyV = h * 0.52;
      const orbitR = Math.min(w, h) * 0.32;
      const coreR = orbitR * 0.135;
      const clusterR = orbitR * 0.12;

      coreSegsRef.current = buildBranch(cxV, cyV, coreR * 1.5, 24, coreR * 0.55, 1.6, 6, 42);
      clusterSegsRef.current = SECTIONS.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const px = cxV + orbitR * Math.sin(rad);
        const py = cyV - orbitR * Math.cos(rad);
        return buildBranch(px, py, clusterR * 1.35, 18, clusterR * 0.45, 1.4, 5, 100 + i);
      });
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(document.documentElement);
    resize();
    setReady(true);

    function onMove(e: MouseEvent) { mouseRef.current = { x: e.clientX, y: e.clientY }; }
    function onLeave() { mouseRef.current = { x: -9999, y: -9999 }; }

    function onClick() {
      const hov = hoveredRef.current;
      if (hov === -1) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cxV = w * 0.5;
      const cyV = h * 0.52;
      if (hov === -2) {
        navigateToBrain(cxV, cyV);
        return;
      }
      const orbitR = Math.min(w, h) * 0.32;
      const rad = (SECTIONS[hov].angle * Math.PI) / 180;
      navigateToSection(hov, cxV + orbitR * Math.sin(rad), cyV - orbitR * Math.cos(rad));
    }

    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cxV = w * 0.5;
      const cyV = h * 0.52;
      const orbitR = Math.min(w, h) * 0.32;
      const coreR = orbitR * 0.135;
      const clusterR = orbitR * 0.12;
      for (let i = 0; i < SECTIONS.length; i++) {
        const rad = (SECTIONS[i].angle * Math.PI) / 180;
        const px = cxV + orbitR * Math.sin(rad);
        const py = cyV - orbitR * Math.cos(rad);
        if (Math.hypot(t.clientX - px, t.clientY - py) < clusterR * 1.5) {
          navigateToSection(i, t.clientX, t.clientY);
          return;
        }
      }
      if (Math.hypot(t.clientX - cxV, t.clientY - cyV) < coreR * 1.8) {
        navigateToBrain(t.clientX, t.clientY);
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
      const cy = h * 0.52;
      const orbitR = Math.min(w, h) * 0.32;
      const coreR = orbitR * 0.135;
      const clusterR = orbitR * 0.12;
      const tsm = time - mountT.current;
      const coreSegs = coreSegsRef.current;
      const clusterSegs = clusterSegsRef.current;

      ctx!.clearRect(0, 0, w, h);

      // ── Background ──
      if (bgOk.current && bgRef.current) {
        ctx!.drawImage(bgRef.current, 0, 0, w, h);
      } else {
        ctx!.fillStyle = BG;
        ctx!.fillRect(0, 0, w, h);
      }
      ctx!.fillStyle = "rgba(5,8,6,0.52)";
      ctx!.fillRect(0, 0, w, h);
      if (grainRef.current) ctx!.drawImage(grainRef.current, 0, 0, w, h);

      // ── Phase 1: Core forms (0–900ms) ──
      const coreT = easeOutCubic(clamp(tsm / 900, 0, 1));
      if (coreSegs && coreT > 0) {
        const vis = Math.floor(coreT * coreSegs.length);
        for (let si = 0; si < vis; si++) {
          const s = coreSegs[si];
          // Glow
          ctx!.save();
          ctx!.globalAlpha = 0.04;
          ctx!.strokeStyle = GLOW;
          ctx!.lineWidth = s.th * 3.5;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(s.x1, s.y1);
          ctx!.lineTo(s.x2, s.y2);
          ctx!.stroke();
          ctx!.restore();
          // Core
          ctx!.save();
          ctx!.globalAlpha = lerp(0.25, 0.55, s.th / 1.6);
          ctx!.strokeStyle = GLOW;
          ctx!.lineWidth = s.th;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(s.x1, s.y1);
          ctx!.lineTo(s.x2, s.y2);
          ctx!.stroke();
          ctx!.restore();
        }
        // Nucleus
        ctx!.save();
        ctx!.globalAlpha = 0.88 * coreT;
        ctx!.fillStyle = GLOW;
        ctx!.beginPath();
        ctx!.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // ── Phase 2: Rhizomorphs (700ms + i*220ms, each 2000ms) ──
      for (let i = 0; i < SECTIONS.length; i++) {
        const rStart = 700 + i * 220;
        const rT = easeOutCubic(clamp((tsm - rStart) / 2000, 0, 1));
        if (rT <= 0) continue;

        const s = SECTIONS[i];
        const rad = (s.angle * Math.PI) / 180;
        const sx = cx + coreR * Math.sin(rad);
        const sy = cy - coreR * Math.cos(rad);
        const ex = cx + orbitR * Math.sin(rad);
        const ey = cy - orbitR * Math.cos(rad);
        const mx2 = (sx + ex) / 2;
        const my2 = (sy + ey) / 2;
        const perpX = -(ey - sy);
        const perpY = ex - sx;
        const pLen = Math.hypot(perpX, perpY) || 1;
        const pnx = perpX / pLen;
        const pny = perpY / pLen;

        const rng = mulberry32(i * 17 + 5);
        const grad = ctx!.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0.0, GLOW);
        grad.addColorStop(1.0, s.colour);

        for (let k = 0; k < 10; k++) {
          const perpOff = (rng() - 0.5) * 9;
          const cpJitter = (rng() - 0.5) * 14;
          const lw = 0.28 + rng() * 0.38;

          const sxK = sx + pnx * perpOff;
          const syK = sy + pny * perpOff;
          const exK = ex + pnx * perpOff * 0.12;
          const eyK = ey + pny * perpOff * 0.12;
          const cpx = mx2 + pnx * cpJitter;
          const cpy = my2 + pny * cpJitter + rng() * orbitR * 0.05;

          ctx!.save();
          ctx!.globalAlpha = 0.48 * rT;
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = lw;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(sxK, syK);
          for (let dt = 0.02; dt <= rT; dt += 0.02) {
            const p = qBezPt(sxK, syK, cpx, cpy, exK, eyK, dt);
            ctx!.lineTo(p.x, p.y);
          }
          ctx!.stroke();
          ctx!.restore();
        }

        // Side branches at t=0.18, 0.36, 0.54, 0.70, 0.85
        const mainCpx = mx2 + pnx * 0;
        const mainCpy = my2 + pny * 0;
        for (const bt of [0.18, 0.36, 0.54, 0.70, 0.85]) {
          if (rT < bt) continue;
          const bp = qBezPt(sx, sy, mainCpx, mainCpy, ex, ey, bt);
          const brCol = lerpColour(GLOW, s.colour, bt);
          const brSegs = buildBranch(
            bp.x, bp.y, orbitR * 0.06,
            3, orbitR * 0.032, 0.45, 4,
            200 + i * 10 + Math.floor(bt * 100),
          );
          for (const seg of brSegs) {
            ctx!.save();
            ctx!.globalAlpha = 0.16;
            ctx!.strokeStyle = brCol;
            ctx!.lineWidth = seg.th;
            ctx!.lineCap = "round";
            ctx!.beginPath();
            ctx!.moveTo(seg.x1, seg.y1);
            ctx!.lineTo(seg.x2, seg.y2);
            ctx!.stroke();
            ctx!.restore();
          }
        }
      }

      // ── Phase 3: Terminal clusters (after rhizomorph completes per section) ──
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let newHov = -1;

      if (clusterSegs) {
        for (let i = 0; i < SECTIONS.length; i++) {
          const cStart = 700 + i * 220 + 2000;
          const cT = easeOutCubic(clamp((tsm - cStart) / 1400, 0, 1));
          if (cT <= 0) continue;

          const s = SECTIONS[i];
          const rad = (s.angle * Math.PI) / 180;
          const px = cx + orbitR * Math.sin(rad);
          const py = cy - orbitR * Math.cos(rad);

          // Hover
          const dist = Math.hypot(mx - px, my - py);
          if (dist < clusterR * 1.5) newHov = i;
          const tgt = newHov === i ? 1.18 : 1.0;
          scalesRef.current[i] = lerp(scalesRef.current[i], tgt, 0.1);
          const sc = scalesRef.current[i];

          const segs = clusterSegs[i];
          const vis = Math.floor(cT * segs.length);

          ctx!.save();
          ctx!.translate(px, py);
          ctx!.scale(sc, sc);
          ctx!.translate(-px, -py);

          for (let si = 0; si < vis; si++) {
            const seg = segs[si];
            // Glow
            ctx!.save();
            ctx!.globalAlpha = 0.05;
            ctx!.strokeStyle = s.colour;
            ctx!.lineWidth = seg.th * 3;
            ctx!.lineCap = "round";
            ctx!.beginPath();
            ctx!.moveTo(seg.x1, seg.y1);
            ctx!.lineTo(seg.x2, seg.y2);
            ctx!.stroke();
            ctx!.restore();
            // Core
            ctx!.save();
            ctx!.globalAlpha = lerp(0.25, 0.55, seg.th / 1.4);
            ctx!.strokeStyle = s.colour;
            ctx!.lineWidth = seg.th;
            ctx!.lineCap = "round";
            ctx!.beginPath();
            ctx!.moveTo(seg.x1, seg.y1);
            ctx!.lineTo(seg.x2, seg.y2);
            ctx!.stroke();
            ctx!.restore();
          }

          // Cluster nucleus
          ctx!.save();
          ctx!.globalAlpha = 0.92 * cT;
          ctx!.fillStyle = s.colour;
          ctx!.beginPath();
          ctx!.arc(px, py, 4, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();

          ctx!.restore();
        }
      }

      // Brain hit test
      if (newHov < 0 && Math.hypot(mx - cx, my - cy) < coreR * 1.8) {
        newHov = -2;
      }
      hoveredRef.current = newHov;
      cvs!.style.cursor = newHov !== -1 ? "pointer" : "default";

      // ── Phase 4: Labels (after last cluster + 300ms, fade 500ms) ──
      const lastClusterEnd = 700 + 5 * 220 + 2000 + 1400;
      const labelT = easeOutCubic(clamp((tsm - lastClusterEnd - 300) / 500, 0, 1));
      if (labelT > 0) {
        ctx!.save();
        ctx!.font = `11px ${MONO}`;
        for (let i = 0; i < SECTIONS.length; i++) {
          const s = SECTIONS[i];
          const rad = (s.angle * Math.PI) / 180;
          const px = cx + orbitR * Math.sin(rad);
          const py = cy - orbitR * Math.cos(rad);
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          ctx!.fillStyle = s.colour;
          ctx!.globalAlpha = 0.80 * labelT;
          ctx!.textBaseline = "middle";
          if (s.angle === 0 || s.angle === 180) ctx!.textAlign = "center";
          else if (s.angle > 180) ctx!.textAlign = "right";
          else ctx!.textAlign = "left";
          drawSpacedText(ctx!, s.label, px + dx * clusterR * 2.1, py + dy * clusterR * 2.1, 3);
        }
        ctx!.restore();

        // BRAIN label
        ctx!.save();
        ctx!.font = `13px ${MONO}`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillStyle = GLOW;
        ctx!.globalAlpha = 0.70 * labelT;
        ctx!.fillText("BRAIN", cx, cy + coreR + 16);
        ctx!.restore();
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
