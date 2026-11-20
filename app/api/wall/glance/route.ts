import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { loadGlance } from "@/lib/system/wallGlance";
import { unauthorised, wallDevice } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/** GET /api/wall/glance — the family board, as the device sees it (lib/wall/contract.ts WallGlance). */
export async function GET() {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  try {
    return NextResponse.json(await loadGlance(await createUserClient(), device));
  } catch (err) {
    console.error("[wall/glance]", err);
    return NextResponse.json({ error: "The board could not be drawn." }, { status: 500 });
  }
}
