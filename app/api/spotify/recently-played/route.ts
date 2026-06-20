import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await spotifyFetch("/me/player/recently-played?limit=50");
    if (!data) return NextResponse.json({ error: "not connected" }, { status: 401 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[spotify/recently-played]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
