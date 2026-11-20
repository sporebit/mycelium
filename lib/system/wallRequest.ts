/**
 * The two questions every wall route asks (master run §11): which wall is
 * this, and is a person unlocked on it. The first comes from the principal
 * the middleware set from the device cookie; the second from the signed
 * ten-minute note (lib/wall/personToken.ts) in the person cookie.
 */
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { PRINCIPAL_SCOPES_HEADER, PRINCIPAL_USER_HEADER, WALL_PERSON_COOKIE } from "@/lib/auth/gate";
import { PERSON_TTL_MS, signPersonNote, verifyPersonNote } from "@/lib/wall/personToken";
import { type WallDevice, deviceForUser } from "./wall";

export const unauthorised = (reason: string, status = 401) => NextResponse.json({ error: "Unauthorized", reason }, { status });

function secret(): string {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("SUPABASE_JWT_SECRET is not set");
  return s;
}

/** The wall behind this request, or null when the principal is not a paired device. */
export async function wallDevice(): Promise<WallDevice | null> {
  const h = await headers();
  const uid = h.get(PRINCIPAL_USER_HEADER);
  // Only a token principal can be a wall: a signed-in person on these routes is not one.
  if (!uid || !h.has(PRINCIPAL_SCOPES_HEADER)) return null;
  return deviceForUser(uid);
}

/** The person unlocked on this wall, or null. */
export async function wallPerson(device: WallDevice): Promise<{ uid: string; until: number } | null> {
  const note = await verifyPersonNote(secret(), (await cookies()).get(WALL_PERSON_COOKIE)?.value, device.id);
  return note ? { uid: note.uid, until: note.exp } : null;
}

/** Put a fresh ten-minute note for `uid` on the response. */
export async function grantPerson(res: NextResponse, device: WallDevice, uid: string, now: Date = new Date()): Promise<number> {
  const exp = now.getTime() + PERSON_TTL_MS;
  res.cookies.set(WALL_PERSON_COOKIE, await signPersonNote(secret(), { uid, device: device.id, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/wall",
    maxAge: Math.floor(PERSON_TTL_MS / 1000),
  });
  return exp;
}

export function revokePerson(res: NextResponse): void {
  res.cookies.set(WALL_PERSON_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/wall", maxAge: 0 });
}
