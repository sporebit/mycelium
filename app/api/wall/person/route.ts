import { NextResponse } from "next/server";
import { loadHome } from "@/lib/home/data";
import { unauthorised, wallDevice, wallPerson } from "@/lib/system/wallRequest";
import { withUser } from "@/lib/system/withUser";
import type { WallPersonView } from "@/lib/wall/contract";

export const runtime = "nodejs";

/**
 * GET /api/wall/person — the unlocked person's own view: the Home contract,
 * drawn as them. Today's plan is made if it is not yet, exactly as opening
 * Home would; the person is at the screen and asked for it.
 */
export async function GET() {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const person = await wallPerson(device);
  if (!person) return unauthorised("locked");
  try {
    const home = await withUser(person.uid, (db) => loadHome(db, person.uid));
    const view: WallPersonView = { person: { id: person.uid, name: home.who.name }, until: person.until, home };
    return NextResponse.json(view);
  } catch (err) {
    console.error("[wall/person]", err);
    return NextResponse.json({ error: "The view could not be drawn." }, { status: 500 });
  }
}
