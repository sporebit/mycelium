import { NextRequest, NextResponse } from "next/server";
import { pullFromGoogle } from "@/lib/google/sync";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await pullFromGoogle();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/google-sync]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
