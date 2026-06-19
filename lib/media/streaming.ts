import { createServerClient } from "@/lib/supabase/server";

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

export function lookupStreaming(itemId: string, title: string) {
  (async () => {
    try {
      const [movie, series] = await Promise.all([
        searchTitle(title, "movie"),
        searchTitle(title, "series"),
      ]);
      const services = [...new Set([...movie, ...series])];
      const supabase = createServerClient();
      await supabase
        .from("media_items")
        .update({
          streaming_services: services.length > 0 ? services : null,
          streaming_checked_at: new Date().toISOString(),
        })
        .eq("id", itemId);
    } catch (err) {
      console.error("[lookupStreaming]", err);
    }
  })();
}
