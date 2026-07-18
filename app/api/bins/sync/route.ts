import { NextResponse } from "next/server";
import { syncBinCollectionsToGoogle } from "@/lib/bins/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncBinCollectionsToGoogle();
  return NextResponse.json(result);
}
