import { NextRequest, NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get("range") || "medium_term";
    const limit = req.nextUrl.searchParams.get("limit") || "20";
    const data = await spotifyFetch(`/me/top/artists?time_range=${range}&limit=${limit}`);
    if (!data) return NextResponse.json({ error: "not connected" }, { status: 401 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[spotify/top-artists]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
