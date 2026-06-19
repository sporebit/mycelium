import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_KEY = process.env.STREAMING_AVAILABILITY_API_KEY;
const BASE = "https://streaming-availability.p.rapidapi.com/shows/search/title";

type StreamingOption = { service?: { id?: string } };

async function searchTitle(title: string, showType: "movie" | "series"): Promise<string[]> {
  if (!API_KEY) return [];
  const url = new URL(BASE);
  url.searchParams.set("title", title);
  url.searchParams.set("country", "gb");
  url.searchParams.set("show_type", showType);
  url.searchParams.set("output_language", "en");

  const res = await fetch(url.toString(), {
    headers: {
      "X-RapidAPI-Key": API_KEY,
      "X-RapidAPI-Host": "streaming-availability.p.rapidapi.com",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) return [];

  const first = items[0];
  const opts: StreamingOption[] = first?.streamingOptions?.gb ?? [];
  return [...new Set(opts.map((o) => o.service?.id).filter(Boolean) as string[])];
}

export async function POST(req: NextRequest) {
  let body: { title?: string; type?: "movie" | "series" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const checkedAt = new Date().toISOString();

  try {
    let services: string[];
    if (body.type === "movie" || body.type === "series") {
      services = await searchTitle(title, body.type);
    } else {
      const [movie, series] = await Promise.all([
        searchTitle(title, "movie"),
        searchTitle(title, "series"),
      ]);
      services = [...new Set([...movie, ...series])];
    }

    return NextResponse.json({ services, checked_at: checkedAt });
  } catch (err) {
    console.error("[/api/media/streaming POST]", err);
    return NextResponse.json({ services: [], checked_at: checkedAt });
  }
}
