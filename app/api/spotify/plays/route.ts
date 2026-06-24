import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PlayRow = {
  track_id: string;
  track_name: string;
  artist_names: string;
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
};

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const counts = req.nextUrl.searchParams.get("counts");

    const supabase = createServerClient();

    if (counts === "true") {
      let query = supabase
        .from("spotify_plays")
        .select("track_id, track_name, artist_names, album_name, album_art_url, duration_ms")
        .order("played_at", { ascending: false });

      if (from) query = query.gte("played_at", `${from}T00:00:00Z`);
      if (to) query = query.lte("played_at", `${to}T23:59:59Z`);

      const { data, error } = await query.limit(10000);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = (data ?? []) as PlayRow[];
      const trackMap = new Map<string, PlayRow & { count: number }>();
      const artistMap = new Map<string, number>();

      for (const row of rows) {
        const existing = trackMap.get(row.track_id);
        if (existing) {
          existing.count++;
        } else {
          trackMap.set(row.track_id, { ...row, count: 1 });
        }
        for (const artist of row.artist_names.split(", ")) {
          const trimmed = artist.trim();
          if (trimmed) artistMap.set(trimmed, (artistMap.get(trimmed) ?? 0) + 1);
        }
      }

      const track_counts = Array.from(trackMap.values()).sort((a, b) => b.count - a.count);
      const artist_counts = Array.from(artistMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({ track_counts, artist_counts, total_plays: rows.length });
    }

    let query = supabase
      .from("spotify_plays")
      .select("*")
      .order("played_at", { ascending: false });

    if (from) query = query.gte("played_at", `${from}T00:00:00Z`);
    if (to) query = query.lte("played_at", `${to}T23:59:59Z`);

    const { data, error } = await query.limit(1000);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plays: data });
  } catch (err) {
    console.error("[spotify/plays GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
