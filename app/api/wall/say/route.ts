import { NextResponse } from "next/server";
import { thingsToSay } from "@/lib/system/wallGlance";
import { unauthorised, wallDevice } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/**
 * GET /api/wall/say — lines to say aloud, each handed over once: a nudge
 * from Kirsty, a spoken reminder, the morning pick. Finance kinds never.
 */
export async function GET() {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  try {
    return NextResponse.json({ say: await thingsToSay(device) });
  } catch (err) {
    console.error("[wall/say]", err);
    return NextResponse.json({ say: [] });
  }
}
