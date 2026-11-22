import { describe, expect, it } from "vitest";
import { parseYouTubeId, readYouTube } from "./youtube";
import type { FetchLike } from "./website";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("parseYouTubeId", () => {
  it("reads every link shape with extra parameters", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=abc123")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("refuses other links", () => {
    expect(parseYouTubeId("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(parseYouTubeId("https://youtu.be/short")).toBeNull();
    expect(parseYouTubeId("nonsense")).toBeNull();
  });
});

describe("readYouTube", () => {
  const oembed = { title: "Hackfall Woods walk", author_name: "Yorkshire Walks", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" };

  it("uses oEmbed alone without a key", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (url) => {
      urls.push(url);
      return json(oembed);
    };
    const r = (await readYouTube("https://youtu.be/dQw4w9WgXcQ", { fetch: f }))!;
    expect(urls).toEqual([`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}&format=json`]);
    expect(r.title).toBe("Hackfall Woods walk");
    expect(r.channel).toBe("Yorkshire Walks");
    expect(r.sources).toEqual(["oembed"]);
    expect(r.location).toBeNull();
    const title = r.facts.find((x) => x.key === "video_title")!;
    expect(title.source_kind).toBe("oembed");
    expect(title.source_url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("adds description, tags and location from the Data API with a key", async () => {
    const f: FetchLike = async (url) => {
      if (url.includes("oembed")) return json(oembed);
      expect(url).toContain("part=snippet,recordingDetails");
      expect(url).toContain("id=dQw4w9WgXcQ");
      expect(url).toContain("key=k123");
      return json({
        items: [
          {
            snippet: { title: "Hackfall Woods walk", channelTitle: "Yorkshire Walks", description: "Follies near Grewelthorpe.", tags: ["hackfall", "yorkshire"] },
            recordingDetails: { location: { latitude: 54.1951, longitude: -1.6512 }, locationDescription: "Hackfall, Grewelthorpe" },
          },
        ],
      });
    };
    const r = (await readYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { apiKey: "k123", fetch: f }))!;
    expect(r.sources).toEqual(["oembed", "youtube"]);
    expect(r.description).toBe("Follies near Grewelthorpe.");
    expect(r.tags).toEqual(["hackfall", "yorkshire"]);
    expect(r.location).toEqual({ lat: 54.1951, lng: -1.6512 });
    const geo = r.facts.find((x) => x.key === "geo")!;
    expect(geo.source_kind).toBe("youtube");
    expect(geo.confidence).toBe(0.7);
    expect(r.facts.find((x) => x.key === "location_description")?.value).toBe("Hackfall, Grewelthorpe");
    expect(r.facts.find((x) => x.key === "video_description")?.value).toBe("Follies near Grewelthorpe.");
  });

  it("falls back to the API when oEmbed fails, and to null when both do", async () => {
    const apiOnly: FetchLike = async (url) => (url.includes("oembed") ? json({}, 401) : json({ items: [{ snippet: { title: "T", channelTitle: "C" } }] }));
    const r = (await readYouTube("https://youtu.be/dQw4w9WgXcQ", { apiKey: "k", fetch: apiOnly }))!;
    expect(r.sources).toEqual(["youtube"]);
    expect(r.title).toBe("T");
    const down: FetchLike = async () => json({}, 500);
    expect(await readYouTube("https://youtu.be/dQw4w9WgXcQ", { apiKey: "k", fetch: down })).toBeNull();
    expect(await readYouTube("https://example.org/", { fetch: down })).toBeNull();
  });
});
