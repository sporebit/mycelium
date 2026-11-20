import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { familyPhotos } from "@/lib/system/wallGlance";
import { unauthorised, wallDevice } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/** GET /api/wall/photos — pictures from the family space for the ambient and guest views, as fifteen-minute links. */
export async function GET() {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  try {
    return NextResponse.json({ photos: await familyPhotos(await createUserClient(), device.team_space_id) });
  } catch (err) {
    console.error("[wall/photos]", err);
    return NextResponse.json({ photos: [] });
  }
}
