import type { Metadata } from "next";
import { WallClient } from "@/components/wall/WallClient";
import { IDLE_AFTER_MS, LOCK_AFTER_MS } from "@/lib/wall/schedule";

export const metadata: Metadata = { title: "Wall", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /wall — the kitchen screen (master run §11). Public by path: it shows a
 * pairing keypad until the device cookie is set, and everything after that
 * comes from /api/wall/* under the device's own membership. The two timer
 * switches only shorten the timers (a check can wait seconds, not minutes);
 * neither can lengthen one. `?board=classic` draws the first family board
 * instead of the tile grid (design D10).
 */
export default async function WallPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const seconds = (v: string | string[] | undefined, fallbackMs: number) => {
    const n = Number(Array.isArray(v) ? v[0] : v);
    return Number.isFinite(n) && n >= 3 && n * 1000 < fallbackMs ? n * 1000 : fallbackMs;
  };
  const board = (Array.isArray(sp.board) ? sp.board[0] : sp.board) === "classic" ? "classic" : "tiles";
  return <WallClient lockAfterMs={seconds(sp.lock_after, LOCK_AFTER_MS)} idleAfterMs={seconds(sp.idle_after, IDLE_AFTER_MS)} board={board} />;
}
