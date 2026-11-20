import { NextResponse } from "next/server";
import { revokePerson } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/** POST /api/wall/lock — back to the family view. The wall calls it on a tap and on its own after two quiet minutes. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  revokePerson(res);
  return res;
}
