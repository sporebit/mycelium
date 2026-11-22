import { describe, expect, it } from "vitest";
import { addressLine, fetchCapped, readWebsite, type FetchLike } from "./website";

type Call = { url: string; init?: RequestInit };

function fake(body: BodyInit | null, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }, finalUrl?: string, status = 200) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const res = new Response(body, { status, headers });
    if (finalUrl) Object.defineProperty(res, "url", { value: finalUrl });
    return res;
  };
  return { f, calls };
}

const OG_ONLY = `<!doctype html><html><head>
<title>Hackfall Woods | Woodland Trust</title>
<meta content="Hackfall: a Georgian folly garden" property="og:title">
<meta property='og:description' content='Follies, waterfalls &amp; views over the Ure.'>
<meta name="twitter:image" content="/img/hackfall.jpg">
<meta property="og:site_name" content="Woodland Trust">
<style>.x{}</style></head><body><header>Menu</header><nav>Home</nav>
<main><h1>Hackfall</h1><p>A wild   woodland
garden.</p><script>var a = 1;</script></main><footer>Copyright</footer></body></html>`;

describe("readWebsite", () => {
  it("reads OpenGraph only, attribute order independent, and readable text", async () => {
    const { f, calls } = fake(OG_ONLY, undefined, "https://www.woodlandtrust.org.uk/visiting-woods/woods/hackfall/");
    const r = (await readWebsite("https://woodlandtrust.org.uk/hackfall", f))!;
    expect(calls[0].url).toBe("https://woodlandtrust.org.uk/hackfall");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toMatch(/text\/html/);
    expect(headers["User-Agent"]).toBe("Mycelium/1.0 (self-hosted planner)");
    expect(r.final_url).toBe("https://www.woodlandtrust.org.uk/visiting-woods/woods/hackfall/");
    expect(r.title).toBe("Hackfall: a Georgian folly garden");
    expect(r.description).toBe("Follies, waterfalls & views over the Ure.");
    expect(r.image).toBe("https://www.woodlandtrust.org.uk/img/hackfall.jpg");
    expect(r.site_name).toBe("Woodland Trust");
    expect(r.text).toBe("Hackfall A wild woodland garden.");
    expect(r.jsonld).toEqual([]);
    expect(r.facts.every((x) => x.source_kind === "opengraph" && x.confidence === 0.5 && x.source_url === r.final_url)).toBe(true);
    expect(r.facts.find((x) => x.key === "name")?.value).toBe("Hackfall: a Georgian folly garden");
  });

  it("reads a JSON-LD Place with address, geo and opening hours", async () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": ["TouristAttraction", "Park"],
      name: "Brimham Rocks",
      telephone: "01423 780688",
      priceRange: "££",
      url: "https://www.nationaltrust.org.uk/brimham-rocks",
      address: { "@type": "PostalAddress", streetAddress: "Summerbridge", addressLocality: "Harrogate", postalCode: "HG3 4DW", addressCountry: { "@type": "Country", name: "GB" } },
      geo: { "@type": "GeoCoordinates", latitude: "54.0794", longitude: -1.6852 },
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["https://schema.org/Saturday", "https://schema.org/Sunday"], opens: "09:00", closes: "17:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "10:00", closes: "16:00" },
      ],
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script><meta property="og:title" content="Brimham"></head><body>x</body></html>`;
    const r = (await readWebsite("https://www.nationaltrust.org.uk/brimham-rocks", fake(html).f))!;
    const get = (k: string) => r.facts.find((x) => x.key === k && x.source_kind === "jsonld");
    expect(get("name")?.value).toBe("Brimham Rocks");
    expect(get("name")?.confidence).toBe(0.85);
    expect(get("name")?.source_url).toBe("https://www.nationaltrust.org.uk/brimham-rocks");
    expect(get("address")?.value).toBe("Summerbridge, Harrogate, HG3 4DW, GB");
    expect(get("geo")?.value).toEqual({ lat: 54.0794, lng: -1.6852 });
    expect(get("telephone")?.value).toBe("01423 780688");
    expect(get("price_range")?.value).toBe("££");
    const hours = get("opening_hours")?.value as Record<number, unknown[]>;
    expect(hours[6]).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(hours[1]).toEqual([{ open: "10:00", close: "16:00" }]);
    expect(hours[2]).toEqual([]);
    expect(r.facts.some((x) => x.source_kind === "opengraph" && x.key === "name")).toBe(true);
  });

  it("flattens @graph and arrays, reads an Event's location, skips broken blocks", async () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Ripon Events" },
        {
          "@type": "Festival",
          name: "Ripon Lantern Parade",
          startDate: "2026-12-05T16:30:00+00:00",
          endDate: "2026-12-05T19:00:00+00:00",
          location: { "@type": "Place", name: "Ripon Market Square", address: "Market Place, Ripon HG4 1BP", geo: { latitude: 54.1361, longitude: -1.5235 } },
        },
      ],
    };
    const html = `<script type="application/ld+json">{ broken</script>
<script type='application/ld+json'>${JSON.stringify([{ "@type": "BreadcrumbList" }])}</script>
<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
    const r = (await readWebsite("https://example.org/lanterns", fake(html).f))!;
    expect(r.jsonld.map((x) => x["@type"])).toEqual(["BreadcrumbList", "WebSite", "Festival"]);
    const get = (k: string) => r.facts.find((x) => x.key === k && x.source_kind === "jsonld")?.value;
    expect(get("name")).toBe("Ripon Lantern Parade");
    expect(get("event_start")).toBe("2026-12-05T16:30:00+00:00");
    expect(get("event_end")).toBe("2026-12-05T19:00:00+00:00");
    expect(get("event_location")).toBe("Ripon Market Square");
    expect(get("address")).toBe("Market Place, Ripon HG4 1BP");
    expect(get("geo")).toEqual({ lat: 54.1361, lng: -1.5235 });
  });

  it("gives the minimal URL-only result for a non-HTML answer", async () => {
    const r = (await readWebsite("https://www.example.org/leaflet.pdf", fake("%PDF-1.7", { "content-type": "application/pdf" }).f))!;
    expect(r.not_html).toBe(true);
    expect(r.title).toBeNull();
    expect(r.site_name).toBe("example.org");
    expect(r.facts).toEqual([]);
    const img = (await readWebsite("https://example.org/a.jpg", fake("xx", { "content-type": "image/jpeg" }).f))!;
    expect(img.image).toBe("https://example.org/a.jpg");
  });

  it("cuts an oversized body off at 1 MB and still parses the head", async () => {
    const big = `<html><head><title>Big page</title></head><body>${"a".repeat(1_500_000)}<script type="application/ld+json">{"@type":"Place","name":"Too late"}</script></body></html>`;
    const r = (await readWebsite("https://example.org/big", fake(big).f))!;
    expect(r.truncated).toBe(true);
    expect(r.title).toBe("Big page");
    expect(r.jsonld).toEqual([]);
    expect(r.text.length).toBe(4000);
  });

  it("returns null for errors, failures and non-web URLs, never throws", async () => {
    expect(await readWebsite("https://example.org/gone", fake("no", undefined, undefined, 404).f)).toBeNull();
    const boom: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await readWebsite("https://example.org/", boom)).toBeNull();
    expect(await readWebsite("ftp://example.org/x", boom)).toBeNull();
    expect(await readWebsite("not a url", boom)).toBeNull();
  });
});

describe("fetchCapped", () => {
  it("times out and comes back null", async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    expect(await fetchCapped(slow, "https://example.org/", {}, { timeoutMs: 20 })).toBeNull();
  });
});

describe("addressLine", () => {
  it("joins PostalAddress parts without repeats", () => {
    expect(addressLine({ streetAddress: "1 High St", addressLocality: "York", addressRegion: "York", postalCode: "YO1 1AA" })).toBe("1 High St, York, YO1 1AA");
    expect(addressLine("Somewhere, Leeds")).toBe("Somewhere, Leeds");
    expect(addressLine(null)).toBeNull();
  });
});
