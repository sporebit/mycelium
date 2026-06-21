import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify/client";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
};

type RecentlyPlayedResponse = {
  items: { track: SpotifyTrack; played_at: string }[];
};

export async function POST() {
  try {
    const data = await spotifyFetch<RecentlyPlayedResponse>(
      "/me/player/recently-played?limit=50",
    );
    if (!data?.items?.length) return NextResponse.json({ synced: 0 });

    const rows = data.items.map((item) => ({
      track_id: item.track.id,
      track_name: item.track.name,
      artist_names: item.track.artists.map((a) => a.name).join(", "),
      album_name: item.track.album?.name ?? null,
      album_art_url: item.track.album?.images?.[0]?.url ?? null,
      duration_ms: item.track.duration_ms,
      played_at: item.played_at,
    }));

    const supabase = createServerClient();
    const { error } = await supabase
      .from("spotify_plays")
      .upsert(rows, { onConflict: "track_id,played_at" });

    if (error) {
      console.error("[spotify/sync-plays]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ synced: rows.length });
  } catch (err) {
    console.error("[spotify/sync-plays]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
