"use client";

import { useEffect, useMemo, useState } from "react";
import { Network } from "@/components/home/Network";
import { Specimen } from "@/components/home/Specimen";
import { SPECIES } from "@/lib/home/specimen";
import type { WallPhoto } from "@/lib/wall/contract";
import { DRIFT_EVERY_MS, driftPosition } from "@/lib/wall/schedule";

const SERIF = "font-[family-name:var(--font-plate)]";

export function Clock({ now, big = true }: { now: Date; big?: boolean }) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(now);
  return (
    <div aria-label="Clock">
      <div className={`${SERIF} ${big ? "text-[9rem]" : "text-6xl"} leading-none tabular-nums`}>{time}</div>
      <div className={`${big ? "text-3xl" : "text-xl"} mt-2 opacity-70`}>{day}</div>
    </div>
  );
}

/**
 * The ambient view (Specimen plate direction): the network backdrop that
 * Home has, one specimen from the same drawings, and the time. The figure
 * walks slowly around the panel so nothing stays lit in one place; no new
 * artwork, nothing moving fast. At night the same, dimmed by the parent.
 */
export function Ambient({ now, seed, weather, photos, night }: { now: Date; seed: number; weather: { hi: number; lo: number; conditions: string } | null; photos: WallPhoto[]; night: boolean }) {
  const [tick, setTick] = useState(() => Math.floor(Date.now() / DRIFT_EVERY_MS));
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), DRIFT_EVERY_MS);
    return () => clearInterval(t);
  }, []);
  const pos = driftPosition(tick);
  const species = (seed + tick) % SPECIES.length;
  // At night, or when the family has no pictures, the plate; otherwise every fourth minute a picture.
  const photo = !night && photos.length && tick % 4 === 3 ? photos[Math.floor(tick / 4) % photos.length] : null;
  const density = useMemo(() => (night ? 0.5 : 0.9), [night]);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Network seed={seed} density={density} spores={night ? 8 : 24} className="absolute inset-0 -z-10 h-full w-full" />
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-contain opacity-90" />
      ) : (
        <div className="absolute transition-all duration-[20000ms] ease-linear" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: "translate(-50%, -50%)", width: "22vmin" }}>
          <Specimen species={species} seed={seed + tick} done={false} size="main" draw={false} />
        </div>
      )}
      <div className="absolute left-12 bottom-12 flex items-end gap-10">
        <Clock now={now} />
        {weather ? (
          <div className="pb-3 text-2xl opacity-70">
            {weather.conditions} · {Math.round(weather.hi)}° / {Math.round(weather.lo)}°
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Guest mode: the clock, the weather, the family's pictures. Nobody's name, nobody's day. */
export function Guest({ now, weather, photos, onLeave }: { now: Date; weather: { hi: number; lo: number; conditions: string } | null; photos: WallPhoto[]; onLeave: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % photos.length), 30_000);
    return () => clearInterval(t);
  }, [photos.length]);
  const photo = photos[i] ?? null;
  // Leaving takes a long press, so a guest's stray tap does not bring the board back.
  const [pressAt, setPressAt] = useState<number | null>(null);
  const down = () => setPressAt(Date.now());
  const up = () => {
    if (pressAt && Date.now() - pressAt >= 1500) onLeave();
    setPressAt(null);
  };
  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="guest">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-contain opacity-95" />
      ) : null}
      <div className="absolute left-12 bottom-12 flex items-end gap-10 drop-shadow">
        <Clock now={now} />
        {weather ? (
          <div className="pb-3 text-2xl opacity-80">
            {weather.conditions} · {Math.round(weather.hi)}° / {Math.round(weather.lo)}°
          </div>
        ) : null}
      </div>
      <button type="button" onPointerDown={down} onPointerUp={up} onPointerLeave={() => setPressAt(null)} className="absolute right-6 top-6 h-14 w-14 rounded-full opacity-30" aria-label="Hold to leave guest mode" data-testid="leave-guest">
        ·
      </button>
    </div>
  );
}
