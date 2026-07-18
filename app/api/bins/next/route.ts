import { NextResponse } from "next/server";
import { loadBinConfig, loadGardenSeasons } from "@/lib/bins/config";
import { getNextCollection, getUpcomingCollections } from "@/lib/bins/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await loadBinConfig();
  if (!config) {
    return NextResponse.json({ error: "Bin schedule not configured" }, { status: 404 });
  }
  const seasons = await loadGardenSeasons();
  const now = new Date();
  return NextResponse.json({
    next: getNextCollection(now, config, seasons),
    upcoming: getUpcomingCollections(now, 4, config, seasons),
  });
}
