import { describe, expect, it } from "vitest";
import { classifySocial, readSocial } from "./social";
import type { FetchLike } from "./website";

const html = (s: string, status = 200, finalUrl?: string) => {
  const res = new Response(s, { status, headers: { "content-type": "text/html" } });
  if (finalUrl) Object.defineProperty(res, "url", { value: finalUrl });
  return res;
};

describe("classifySocial", () => {
  it("knows the three and their short links", () => {
    expect(classifySocial("https://www.instagram.com/p/Cabc123/")).toBe("instagram");
    expect(classifySocial("https://instagr.am/p/Cabc123")).toBe("instagram");
    expect(classifySocial("https://www.facebook.com/share/p/abc/")).toBe("facebook");
    expect(classifySocial("https://fb.watch/xyz/")).toBe("facebook");
    expect(classifySocial("https://m.facebook.com/story.php?id=1")).toBe("facebook");
    expect(classifySocial("https://vm.tiktok.com/ZGabc/")).toBe("tiktok");
    expect(classifySocial("https://www.tiktok.com/@someone/video/123")).toBe("tiktok");
    expect(classifySocial("https://example.org/instagram.com")).toBeNull();
    expect(classifySocial("rubbish")).toBeNull();
  });
});

describe("readSocial", () => {
  it("takes the caption out of an Instagram OpenGraph description", async () => {
    const page = `<meta property="og:description" content="1,204 likes, 33 comments - walksyorks on 1 May 2026: &quot;Bluebells at Hackfall this weekend&quot;.">
<meta property="og:image" content="https://cdn.example/ig.jpg"><meta property="og:title" content="Walks Yorks on Instagram">`;
    const calls: RequestInit[] = [];
    const f: FetchLike = async (_u, init) => {
      calls.push(init ?? {});
      return html(page);
    };
    const r = (await readSocial("https://www.instagram.com/p/Cabc123/", f))!;
    expect(r.kind).toBe("instagram");
    expect(r.blocked).toBe(false);
    expect(r.caption).toBe("Bluebells at Hackfall this weekend");
    expect(r.image).toBe("https://cdn.example/ig.jpg");
    expect(r.facts.find((x) => x.key === "social_caption")?.source_kind).toBe("opengraph");
    expect(calls).toHaveLength(1);
    expect(calls[0].credentials).toBe("omit");
  });

  it("reports blocked on a login wall, a generic page or an error — the normal case", async () => {
    const wall: FetchLike = async () => html(`<meta property="og:title" content="Instagram">`, 200, "https://www.instagram.com/accounts/login/?next=/p/x/");
    expect((await readSocial("https://www.instagram.com/p/x/", wall))!.blocked).toBe(true);
    const generic: FetchLike = async () => html(`<title>Facebook</title><meta name="description" content="Log in to Facebook to start sharing.">`);
    const fb = (await readSocial("https://www.facebook.com/share/p/abc/", generic))!;
    expect(fb.blocked).toBe(true);
    expect(fb.caption).toBeNull();
    expect(fb.facts).toEqual([]);
    const err: FetchLike = async () => html("", 403);
    expect((await readSocial("https://fb.watch/xyz/", err))!.blocked).toBe(true);
  });

  it("uses TikTok's public oEmbed", async () => {
    const f: FetchLike = async (url) => {
      expect(url.startsWith("https://www.tiktok.com/oembed?url=")).toBe(true);
      return new Response(JSON.stringify({ title: "Best chippy in Whitby #whitby", author_name: "fishfan", thumbnail_url: "https://p16.example/t.jpg" }), { headers: { "content-type": "application/json" } });
    };
    const r = (await readSocial("https://vm.tiktok.com/ZGabc/", f))!;
    expect(r.blocked).toBe(false);
    expect(r.caption).toBe("Best chippy in Whitby #whitby");
    expect(r.author).toBe("fishfan");
    expect(r.facts.every((x) => x.source_kind === "oembed")).toBe(true);
  });

  it("is null for a non-social link and never throws", async () => {
    const boom: FetchLike = async () => {
      throw new Error("offline");
    };
    expect(await readSocial("https://example.org/", boom)).toBeNull();
    expect((await readSocial("https://www.tiktok.com/@a/video/1", boom))!.blocked).toBe(true);
  });
});
