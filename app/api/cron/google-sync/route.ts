import { NextRequest, NextResponse } from "next/server";
import { pullFromGoogle } from "@/lib/google/sync";
import { withUser } from "@/lib/system/withUser";
import { boundUser } from "@/lib/system/bindings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  // Fail closed: an unset secret must not open the route.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await withUser(boundUser("google_sync"), (db) => pullFromGoogle(db));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/google-sync]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
