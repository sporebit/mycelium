/**
 * The watchers against saved replies (e2e/fixtures/finds): what each keeps
 * and what it leaves out, and that the whole run never touches the network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureFetch, fixtureFor } from "../fixtures";
import { dedupe } from "../store";
import { advisoriesUrl, affectsChunks, dependencyList, parseAdvisories, parseNpmAudit, watchAdvisories } from "./advisories";
import { GITHUB_QUERIES, githubReadmeUrl, githubSearchUrl, parseGithubSearch, watchGithub } from "./github";
import { HN_QUERIES, hnSearchUrl, parseHnSearch, watchHn } from "./hn";
import { feedCandidates, parseFeed, watchFeeds } from "./rss";

const DIR = path.resolve(process.cwd(), "e2e/fixtures/finds");
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8");
const NOW = new Date("2026-11-20T10:00:00Z");

describe("GitHub", () => {
  it("builds a search over repos created since a date, best first", () => {
    const u = new URL(githubSearchUrl("topic:mcp-server", "2026-11-13"));
    expect(u.searchParams.get("q")).toBe("topic:mcp-server created:>2026-11-13 archived:false");
    expect(u.searchParams.get("sort")).toBe("stars");
  });
  it("keeps the one real repo and leaves out the fork, the archived one and the one below the floor", () => {
    const found = parseGithubSearch(JSON.parse(read("github-search.json")), GITHUB_QUERIES[0]);
    expect(found.map((c) => c.url)).toEqual(["https://github.com/e2e-finds/mcp-house-server"]);
    expect(found[0]).toMatchObject({ title: "e2e-finds/mcp-house-server", source: "github", source_ref: "MCP servers", kind: "skill" });
    expect(found[0].raw).toMatchObject({ stars: 120, language: "TypeScript", licence: "MIT", topics: ["mcp-server", "home-automation", "agents"] });
  });
  it("tolerates a reply that is not a search result", () => {
    expect(parseGithubSearch({ message: "rate limited" }, GITHUB_QUERIES[0])).toEqual([]);
    expect(parseGithubSearch(null, GITHUB_QUERIES[0])).toEqual([]);
  });
  it("knows a repo's README address", () => {
    expect(githubReadmeUrl("https://github.com/e2e-finds/mcp-house-server")).toBe("https://api.github.com/repos/e2e-finds/mcp-house-server/readme");
    expect(githubReadmeUrl("https://github.com/e2e-finds")).toBeNull();
  });
  it("runs every query from the fixtures and the same repo comes back once after dedupe", async () => {
    const { found, errors } = await watchGithub(fixtureFetch(DIR), NOW);
    expect(errors).toEqual([]);
    expect(found.length).toBe(GITHUB_QUERIES.length);
    expect(dedupe(found).map((c) => c.url)).toEqual(["https://github.com/e2e-finds/mcp-house-server"]);
  });
});

describe("Hacker News", () => {
  it("asks Algolia for stories above a points floor since a time", () => {
    const u = new URL(hnSearchUrl("Claude Code", 1_700_000_000, 40));
    expect(u.hostname).toBe("hn.algolia.com");
    expect(u.searchParams.get("tags")).toBe("story");
    expect(u.searchParams.get("numericFilters")).toBe("points>40,created_at_i>1700000000");
  });
  it("keeps the story's own link, normalised, and the thread for a story with no link; drops the quiet one", () => {
    const found = parseHnSearch(JSON.parse(read("hn-search.json")), HN_QUERIES[0]);
    expect(found.map((c) => c.url)).toEqual(["https://skillfile.example.org", "https://news.ycombinator.com/item?id=90000002"]);
    expect(found[0]).toMatchObject({ source: "hn", kind: "article", source_ref: "Claude Code and MCP" });
    expect(found[0].raw).toMatchObject({ points: 212, comments: 84, thread: "https://news.ycombinator.com/item?id=90000001" });
    expect(found[1].kind).toBe("post");
  });
  it("applies each query's own floor", () => {
    const strict = parseHnSearch(JSON.parse(read("hn-search.json")), { label: "x", query: "x", minPoints: 120 });
    expect(strict.map((c) => c.url)).toEqual(["https://skillfile.example.org"]);
  });
  it("runs from the fixtures without an error", async () => {
    const { found, errors } = await watchHn(fixtureFetch(DIR), NOW);
    expect(errors).toEqual([]);
    expect(dedupe(found).length).toBe(2);
  });
});

describe("feeds", () => {
  it("reads Atom: title, the alternate link, no date, the summary stripped of tags", () => {
    const entries = parseFeed(read("feed.xml"));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ title: "Motion tokens: one easing table for a whole design system", link: "https://blog.e2e-finds.example/motion-tokens?utm_campaign=feed", published: null, summary: "How we keep every transition under 300 ms with one table of tokens." });
    expect(entries[1]).toMatchObject({ link: "https://blog.e2e-finds.example/old-post", published: "2020-01-01T00:00:00Z", summary: "Old news." });
  });
  it("reads RSS 2.0: CDATA titles decoded, an item with no link dropped", () => {
    const entries = parseFeed(read("rss2.xml"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Supabase & row level security: a checklist", link: "https://news.e2e-finds.example/rls-checklist", summary: "Twelve checks before a table goes live." });
  });
  it("is empty for a page that is not a feed", () => {
    expect(parseFeed(read("page.html"))).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });
  it("keeps the undated entry as new and drops the old one; the link is normalised", () => {
    const found = feedCandidates(parseFeed(read("feed.xml")), { label: "E2E", url: "https://feed.e2e-finds.example/atom.xml" }, NOW);
    expect(found.map((c) => c.url)).toEqual(["https://blog.e2e-finds.example/motion-tokens"]);
    expect(found[0]).toMatchObject({ source: "rss", source_ref: "E2E", kind: "article" });
  });
  it("runs a feed list from the fixtures, and reports a feed that will not answer without stopping the others", async () => {
    const good = await watchFeeds(fixtureFetch(DIR), NOW, [
      { label: "E2E", url: "https://feed.e2e-finds.example/atom.xml" },
      { label: "Second", url: "https://other.e2e-finds.example/feed" },
    ]);
    // Both addresses answer from the same fixture file; each entry is kept against its own feed, dedupe comes later.
    expect(good.found).toHaveLength(2);
    expect(good.found.map((c) => c.source_ref)).toEqual(["E2E", "Second"]);
    expect(good.errors).toEqual([]);

    const down = (async (input: string | URL | Request) => (String(input).includes("down") ? new Response("gone", { status: 404 }) : fixtureFetch(DIR)(input))) as unknown as typeof fetch;
    const mixed = await watchFeeds(down, NOW, [
      { label: "Down", url: "https://down.example/feed.xml" },
      { label: "E2E", url: "https://feed.e2e-finds.example/atom.xml" },
    ]);
    expect(mixed.found).toHaveLength(1);
    expect(mixed.errors).toEqual(["Down: the feed answered 404"]);
  });
});

describe("advisories", () => {
  it("lists dependencies at their installed versions and chunks them for the affects parameter", () => {
    const deps = dependencyList({ dependencies: { next: "^15.0.0", react: "19.0.0" }, devDependencies: { vitest: "~2.0.0", next: "^15.0.0" } }, { next: "15.5.3" });
    expect(deps).toEqual(["next@15.5.3", "react@19.0.0", "vitest@2.0.0"]);
    const many = Array.from({ length: 200 }, (_, i) => `package-${i}@1.0.${i}`);
    const chunks = affectsChunks(many);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(950);
    expect(chunks.join(",").split(",")).toEqual(many);
    expect(new URL(advisoriesUrl(chunks[0])).searchParams.get("ecosystem")).toBe("npm");
  });
  it("keeps the advisory with a summary and its packages; drops the empty one", () => {
    const found = parseAdvisories(JSON.parse(read("advisories.json")));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ url: "https://github.com/advisories/GHSA-e2ef-inds-0001", source: "advisory", kind: "advisory", source_ref: "next", title: "HIGH: Fixture: a made-up server-side request forgery in an image loader" });
    expect(found[0].raw).toMatchObject({ ghsa: "GHSA-e2ef-inds-0001", cve: "CVE-2026-00001", severity: "high", packages: [{ name: "next", range: "< 15.99.1", fixed: "15.99.1" }] });
  });
  it("runs from the fixtures", async () => {
    const { found, errors } = await watchAdvisories(fixtureFetch(DIR), ["next@15.5.3"], {});
    expect(errors).toEqual([]);
    expect(found).toHaveLength(1);
  });
  it("reads npm audit's JSON: one find per vulnerable package, the advisory's page when npm gives one", () => {
    const found = parseNpmAudit(JSON.parse(read("npm-audit.json")));
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ url: "https://github.com/advisories/GHSA-fixt-ure0-0002", source: "audit", kind: "advisory", source_ref: "fixture-lib", title: "MODERATE: fixture-lib — Fixture: prototype pollution in merge()" });
    expect(found[0].raw).toMatchObject({ severity: "moderate", range: "<2.1.0", fix_available: true });
    expect(found[1]).toMatchObject({ url: "https://www.npmjs.com/package/other-lib", source_ref: "other-lib" });
    expect(found[1].raw).toMatchObject({ fix_available: false });
    expect(parseNpmAudit({})).toEqual([]);
    expect(parseNpmAudit("nonsense")).toEqual([]);
  });
});

describe("fixtures stand in for every host the watchers reach", () => {
  it("maps each address to its file", () => {
    expect(fixtureFor("https://api.github.com/search/repositories?q=x")?.file).toBe("github-search.json");
    expect(fixtureFor("https://api.github.com/advisories?ecosystem=npm")?.file).toBe("advisories.json");
    expect(fixtureFor("https://api.github.com/repos/a/b/readme")?.file).toBe("readme.md");
    expect(fixtureFor("https://hn.algolia.com/api/v1/search?query=x")?.file).toBe("hn-search.json");
    expect(fixtureFor("https://simonwillison.net/atom/everything/")?.file).toBe("feed.xml");
    expect(fixtureFor("https://blog.example/some-article")?.file).toBe("page.html");
    expect(fixtureFor("nonsense")).toBeNull();
  });
});
