import { NextResponse } from "next/server";
import { syncBinCollectionsToGoogle } from "@/lib/bins/sync";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncBinCollectionsToGoogle(await createUserClient());
  return NextResponse.json(result);
}
