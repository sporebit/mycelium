import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const token = await getValidAccessToken();
    return NextResponse.json({ connected: !!token });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
