import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await spotifyFetch("/me/player/currently-playing");
    if (!data) return NextResponse.json({ playing: false });
    return NextResponse.json({ playing: true, data });
  } catch (err) {
    console.error("[spotify/now-playing]", err);
    return NextResponse.json({ playing: false });
  }
}
