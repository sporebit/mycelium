"use client";

/**
 * The living backdrop of Home: a network of threads that grows in from one
 * point, sways, leans away from the pointer (or a finger), and puts out a
 * burst of new growth when something is finished. Ported from the Plate
 * mock-up's engine (docs/design/home-views/Plate.dc.html).
 *
 * It is seeded, so a person's network is the same shape each visit, and
 * its size follows `density`: the more they have finished, the more of it
 * there is. Three depth layers give parallax.
 *
 * Decoration only: hidden from assistive tech, never in the way of a tap.
 * With motion reduced or off it is drawn once, fully grown, and holds
 * still.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { seeded } from "@/lib/home/specimen";

export type NetworkHandle = {
  /** New growth from a point, in 0–1 of the canvas each way. */
  burst: (nx: number, ny: number) => void;
};

type Seg = { x1: number; y1: number; x2: number; y2: number; z: number; bt: number; ph: number };
type Spore = { x: number; y: number; vx: number; vy: number; s: number };

const LAYERS = [
  { color: "rgba(236,230,210,0.44)", width: 1.4, sway: 0.4, par: 16, push: 30 },
  { color: "rgba(236,230,210,0.26)", width: 1, sway: 0.6, par: 9, push: 18 },
  { color: "rgba(236,230,210,0.14)", width: 0.8, sway: 0.8, par: 4, push: 10 },
] as const;
const SPORE_COLOUR = "rgba(236,230,210,0.4)";
const REPEL = 150;
/** Where the threads run to, as fractions of the canvas: toward the figures, the margins and off the page. */
const ENDS: ReadonlyArray<readonly [number, number]> = [
  [0.26, 0.86], [0.38, 0.87], [0.5, 0.88], [0.62, 0.87], [0.2, 0.28], [0.2, 0.46], [0.2, 0.62],
  [0.86, 0.32], [0.86, 0.6], [0.5, 0.99], [0.02, 0.9], [0.98, 0.9], [0.35, 0.99], [0.7, 0.99],
];

class Engine {
  segs: Seg[] = [];
  spores: Spore[] = [];
  w = 0;
  h = 0;
  t0 = 0;
  maxSegs: number;
  r: () => number;
  mx: number | null = null;
  my: number | null = null;

  constructor(
    readonly seed: number,
    readonly density: number,
    readonly sporeCount: number,
    public still: boolean,
  ) {
    this.r = seeded(seed);
    // A new account has a small network; a long history fills the page.
    this.maxSegs = Math.round(600 + 2200 * Math.max(0, Math.min(1, density)));
  }

  seg(x1: number, y1: number, x2: number, y2: number, z: number, bt: number): void {
    if (this.segs.length < this.maxSegs) this.segs.push({ x1, y1, x2, y2, z, bt, ph: this.r() * 6.283 });
  }

  wander(x0: number, y0: number, ang0: number, steps: number, z: number, bt: number, gen: number): void {
    let x = x0;
    let y = y0;
    let ang = ang0;
    const st = 9 + this.r() * 5;
    for (let i = 0; i < steps; i++) {
      ang += (this.r() - 0.5) * 0.62;
      const nx = x + Math.cos(ang) * st;
      const ny = y + Math.sin(ang) * st;
      this.seg(x, y, nx, ny, z, bt + i * 26);
      x = nx;
      y = ny;
      if (gen < 3 && this.r() < 0.085) this.wander(x, y, ang + (this.r() < 0.5 ? -1 : 1) * (0.5 + this.r() * 0.7), Math.round(steps * 0.6), z, bt + i * 26, gen + 1);
    }
  }

  trunk(pts: Array<[number, number]>, z: number, bt: number, sprout: number): void {
    let t = bt;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy) || 1;
      const n = Math.max(2, Math.round(d / 12));
      const px = -dy / d;
      const py = dx / d;
      let wob = 0;
      let lx = ax;
      let ly = ay;
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        wob = wob * 0.86 + (this.r() - 0.5) * 9;
        const e = Math.sin(Math.PI * f);
        const x = ax + dx * f + px * wob * e;
        const y = ay + dy * f + py * wob * e;
        this.seg(lx, ly, x, y, z, t);
        t += 16;
        if (this.r() < sprout) this.wander(x, y, Math.atan2(dy, dx) + (this.r() < 0.5 ? -1 : 1) * (0.6 + this.r() * 0.9), 5 + Math.round(this.r() * 16), Math.min(2, z + (this.r() < 0.5 ? 0 : 1)), t, 1);
        lx = x;
        ly = y;
      }
    }
  }

  build(w: number, h: number): void {
    this.r = seeded(this.seed);
    this.segs = [];
    this.spores = [];
    this.w = w;
    this.h = h;
    const B: [number, number] = [w * 0.5, h * 0.56];
    for (let i = 0; i < ENDS.length; i++) {
      for (let k = 0; k < 2; k++) {
        const mid: [number, number] = [(B[0] + ENDS[i][0] * w) / 2 + (this.r() - 0.5) * 120, (B[1] + ENDS[i][1] * h) / 2 + (this.r() - 0.5) * 90];
        this.trunk([B, mid, [ENDS[i][0] * w, ENDS[i][1] * h]], (i + k) % 3, i * 110 + k * 200, 0.6);
      }
    }
    for (let i = 0; i < this.sporeCount; i++) {
      this.spores.push({ x: this.r() * w, y: this.r() * h, vx: (this.r() - 0.5) * 0.12, vy: -0.03 + (this.r() - 0.5) * 0.1, s: 0.8 + this.r() * 1.8 });
    }
  }

  burst(nx: number, ny: number, now: number): void {
    if (!this.w) return;
    const keep = this.maxSegs;
    this.maxSegs = this.segs.length + 260;
    for (let i = 0; i < 9; i++) this.wander(nx * this.w, ny * this.h, this.r() * 6.283, 8 + Math.round(this.r() * 12), i % 3, this.still ? 0 : now + i * 40, 1);
    this.maxSegs = Math.max(keep, this.maxSegs);
  }

  draw(c: CanvasRenderingContext2D, now: number): void {
    const { w, h } = this;
    const t = this.still ? 1e9 : now;
    const mx = this.mx ?? -9999;
    const my = this.my ?? -9999;
    const pxn = this.still || this.mx == null ? 0 : this.mx / w - 0.5;
    const pyn = this.still || this.my == null ? 0 : this.my / h - 0.5;
    for (let z = 2; z >= 0; z--) {
      const L = LAYERS[z];
      c.beginPath();
      for (const s of this.segs) {
        if (s.z !== z || s.bt > t) continue;
        const sw = this.still ? 0 : Math.sin(t * 0.0007 + s.ph) * L.sway;
        let x1 = s.x1 + sw - pxn * L.par;
        let y1 = s.y1 - pyn * L.par;
        let x2 = s.x2 + sw - pxn * L.par;
        let y2 = s.y2 - pyn * L.par;
        if (!this.still) {
          const ddx = x2 - mx;
          const ddy = y2 - my;
          const dd = Math.hypot(ddx, ddy);
          if (dd < REPEL && dd > 0.01) {
            const p = Math.pow(1 - dd / REPEL, 2) * L.push;
            x2 += (ddx / dd) * p;
            y2 += (ddy / dd) * p;
            x1 += (ddx / dd) * p * 0.7;
            y1 += (ddy / dd) * p * 0.7;
          }
        }
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
      }
      c.strokeStyle = L.color;
      c.lineWidth = L.width;
      c.lineCap = "round";
      c.stroke();
    }
    c.fillStyle = SPORE_COLOUR;
    for (const sp of this.spores) {
      if (!this.still) {
        sp.x += sp.vx;
        sp.y += sp.vy;
        if (sp.y < -4) sp.y = h + 4;
        if (sp.y > h + 4) sp.y = -4;
        if (sp.x < -4) sp.x = w + 4;
        if (sp.x > w + 4) sp.x = -4;
      }
      c.beginPath();
      c.arc(sp.x, sp.y, sp.s, 0, 6.283);
      c.fill();
    }
  }
}

function motionIsStill(): boolean {
  if (typeof window === "undefined") return true;
  const pref = document.documentElement.dataset.motion;
  return pref === "off" || pref === "reduced" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export const Network = forwardRef<NetworkHandle, { seed: number; density: number; spores?: number; className?: string }>(function Network({ seed, density, spores = 34, className }, ref) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const engine = useRef<Engine | null>(null);

  useImperativeHandle(ref, () => ({
    burst: (nx, ny) => {
      const eng = engine.current;
      if (!eng) return;
      eng.burst(nx, ny, performance.now() - eng.t0);
      // Held still, nothing is animating: ask for one more drawing so the new growth shows.
      canvas.current?.dispatchEvent(new Event("network-redraw"));
    },
  }));

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const eng = new Engine(seed, density, spores, motionIsStill());
    engine.current = eng;
    let raf = 0;
    let stopped = false;

    const frame = (ts: number) => {
      if (stopped) return;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w && h) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (w !== eng.w || h !== eng.h) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
          eng.t0 = ts;
          eng.build(w, h);
        }
        const c = cv.getContext("2d");
        if (c) {
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.clearRect(0, 0, w, h);
          eng.draw(c, ts - eng.t0);
        }
      }
      // Held still: one drawing is enough; it is redrawn only when the size changes or something bursts.
      if (!eng.still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const point = (x: number, y: number) => {
      const b = cv.getBoundingClientRect();
      eng.mx = x - b.left;
      eng.my = y - b.top;
    };
    const onMouse = (e: MouseEvent) => point(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) point(t.clientX, t.clientY);
    };
    const away = () => {
      eng.mx = null;
      eng.my = null;
    };
    const redraw = () => {
      if (eng.still) raf = requestAnimationFrame(frame);
    };
    if (!eng.still) {
      window.addEventListener("mousemove", onMouse, { passive: true });
      window.addEventListener("touchstart", onTouch, { passive: true });
      window.addEventListener("touchmove", onTouch, { passive: true });
      window.addEventListener("touchend", away, { passive: true });
      document.addEventListener("mouseleave", away);
    }
    window.addEventListener("resize", redraw);
    cv.addEventListener("network-redraw", redraw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", away);
      document.removeEventListener("mouseleave", away);
      window.removeEventListener("resize", redraw);
      cv.removeEventListener("network-redraw", redraw);
      engine.current = null;
    };
  }, [seed, density, spores]);

  return <canvas ref={canvas} aria-hidden="true" className={className} data-testid="home-network" />;
});
