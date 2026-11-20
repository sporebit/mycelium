/**
 * The pure parts of the Finds feed: one entry per URL, the verdict's shape
 * read strictly, the export in the resources format, the week's digest
 * saying nothing the app never says, the close-out's top five, the page
 * opener's safety, and the schedule entry the tick runs.
 */
import { describe, expect, it } from "vitest";
import { bannedIn } from "@/lib/daily/words";
import { dueJobs } from "@/lib/system/schedule";
import { rankFinds, toCard } from "./cards";
import { htmlToText, openable, openFind } from "./open";
import { dedupe, exportMarkdown } from "./store";
import type { Candidate, FindRow } from "./types";
import { parseVerdict, PROJECTS, VERDICT_SYSTEM, verdictPrompt } from "./verdict";
import { digestText, isSundayEvening, weekStart } from "./week";

const cand = (url: string, extra: Partial<Candidate> = {}): Candidate => ({ url, title: url, source: "github", source_ref: null, kind: "repo", raw: {}, ...extra });
const row = (extra: Partial<FindRow>): FindRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  url: "https://github.com/a/b",
  title: "a/b",
  source: "github",
  source_ref: "MCP servers",
  kind: "repo",
  found_at: "2026-11-18T09:00:00Z",
  raw: {},
  verdict: null,
  verdict_by: null,
  verdicted_at: null,
  answer: null,
  answered_at: null,
  capture_id: null,
  ...extra,
});
const verdict = (call: "use_now" | "maybe_later" | "skip", summary = "One line.") => ({ what: "A thing.", cost: "free", licence: "MIT", cautions: "none noted", verdict: call, suits: ["Mycelium"], summary });

describe("dedupe — a find is kept once", () => {
  it("collapses the same page written three ways and keeps the first mention", () => {
    const out = dedupe([cand("https://github.com/A/B?utm_source=x", { title: "first" }), cand("https://www.github.com/A/B/", { title: "second" }), cand("http://github.com/A/B#readme", { title: "third" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: "https://github.com/A/B", title: "first" });
  });
  it("drops what will not normalise and tidies a title", () => {
    const out = dedupe([cand("not a url"), cand("https://x.com/a", { title: "  many   spaces  " })]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("many spaces");
  });
});

describe("parseVerdict — strict", () => {
  it("reads a good answer, including one wrapped in a code fence", () => {
    const text = '```json\n{"what":"An MCP server for a house.","cost":"free","licence":"MIT","cautions":"young","verdict":"Use now","suits":["Mycelium","Mycelium","Home 3D survey"],"summary":"Worth an hour."}\n```';
    expect(parseVerdict(text)).toEqual({ what: "An MCP server for a house.", cost: "free", licence: "MIT", cautions: "young", verdict: "use_now", suits: ["Mycelium", "Home 3D survey"], summary: "Worth an hour." });
  });
  it("fills what is missing with 'not stated' but never invents a call or a summary", () => {
    expect(parseVerdict('{"what":"x","verdict":"skip","summary":"y"}')).toMatchObject({ cost: "not stated", licence: "not stated", cautions: "none noted", suits: ["none"] });
    expect(parseVerdict('{"what":"x","verdict":"probably","summary":"y"}')).toBeNull();
    expect(parseVerdict('{"what":"x","verdict":"skip"}')).toBeNull();
    expect(parseVerdict("I think it is fine.")).toBeNull();
    expect(parseVerdict("")).toBeNull();
  });
  it("finds the JSON inside chatter", () => {
    expect(parseVerdict('Here you go: {"what":"x","verdict":"maybe_later","summary":"y"} hope that helps')?.verdict).toBe("maybe_later");
  });
});

describe("verdictPrompt", () => {
  it("carries the facts the watcher saw, the project list and the page text; says when the page would not open", () => {
    const find = row({ raw: { stars: 120, licence: "MIT", topics: ["mcp"], snippet: "A house server." } });
    const withText = verdictPrompt(find, "README says hello");
    expect(withText).toContain("url: https://github.com/a/b");
    expect(withText).toContain("stars: 120");
    expect(withText).toContain("snippet: A house server.");
    expect(withText).toContain(PROJECTS.join(" | "));
    expect(withText).toContain("README says hello");
    expect(verdictPrompt(find, null)).toContain("could not be opened");
    expect(VERDICT_SYSTEM).toContain("Never tell the person to install anything");
  });
});

describe("exportMarkdown — the resources record's shape", () => {
  it("has the table with the record's columns and the three verdict lists", () => {
    const rows = [row({ verdict: verdict("use_now", "Try it."), raw: { text: "opened" }, answer: "keep" }), row({ id: "00000000-0000-4000-8000-000000000002", url: "https://x.com/p/status/1", title: "a post | with a pipe", kind: "post", source: "share", verdict: verdict("skip") }), row({ id: "00000000-0000-4000-8000-000000000003", url: "https://y.example", title: "unjudged" })];
    const md = exportMarkdown(rows, { now: new Date("2026-11-22T18:00:00Z") });
    expect(md).toContain("# Finds — 2026-11-15 to 2026-11-22");
    expect(md).toContain("| Find | Source | What it does | Cost | Licence | Verdict | Could also help | Cautions | Opened | Answer |");
    expect(md).toContain("| [a/b](https://github.com/a/b) | GitHub (MCP servers) | A thing. | free | MIT | Use now | Mycelium | none noted | yes | keep |");
    expect(md).toContain("a post \\| with a pipe");
    expect(md).toContain("| — | — | — | — | — | — | no | — |");
    expect(md).toContain("## Use now (free)\n\n- **a/b** — Try it. *(Mycelium)*");
    expect(md).toContain("## Skip");
    expect(md).not.toContain("## Maybe later");
    expect(md).toContain("Nothing here was installed");
  });
});

describe("the week and the digest", () => {
  it("starts the week on Monday, London", () => {
    expect(weekStart(new Date("2026-11-22T20:00:00Z"))).toBe("2026-11-16"); // a Sunday evening
    expect(weekStart(new Date("2026-11-16T00:30:00Z"))).toBe("2026-11-16"); // Monday just after midnight
    expect(weekStart(new Date("2026-11-20T10:00:00Z"))).toBe("2026-11-16"); // Friday
  });
  it("is Sunday evening from 17:00 London", () => {
    expect(isSundayEvening(new Date("2026-11-22T17:00:00Z"))).toBe(true);
    expect(isSundayEvening(new Date("2026-11-22T16:59:00Z"))).toBe(false);
    expect(isSundayEvening(new Date("2026-11-21T19:00:00Z"))).toBe(false);
  });
  it("says the count, the few worth a look, the advisories and where to answer, and nothing the app never says", () => {
    const rows = [row({ verdict: verdict("use_now", "An MCP server for the house; free.") }), row({ id: "2", title: "second", verdict: verdict("maybe_later") }), row({ id: "3", title: "HIGH: an advisory", kind: "advisory", source: "advisory" }), row({ id: "4", title: "fourth" })];
    const text = digestText(rows)!;
    expect(text.title).toBe("This week's finds");
    expect(text.body).toContain("4 finds this week, 2 with a verdict.");
    expect(text.body).toContain("Worth a look now (1):");
    expect(text.body).toContain("• a/b — An MCP server for the house; free.");
    expect(text.body).toContain("Maybe later: 1 (second).");
    expect(text.body).toContain("1 security advisory for the stack");
    expect(text.body).toContain("Keep or skip each on the week's page.");
    expect(bannedIn(`${text.title} ${text.body}`)).toBeNull();
    expect(text.body.split("\n").length).toBeLessThan(14);
  });
  it("has nothing to say about an empty week", () => {
    expect(digestText([])).toBeNull();
  });
});

describe("the close-out's cards", () => {
  it("ranks advisories first, then Use now, Maybe later, the rest; leaves out what is answered", () => {
    const rows = [row({ id: "a", title: "unjudged", found_at: "2026-11-19T09:00:00Z" }), row({ id: "b", title: "later", verdict: verdict("maybe_later") }), row({ id: "c", title: "now", verdict: verdict("use_now") }), row({ id: "d", title: "advisory", kind: "advisory" }), row({ id: "e", title: "done", verdict: verdict("use_now"), answer: "keep" }), row({ id: "f", title: "skip", verdict: verdict("skip") })];
    expect(rankFinds(rows).map((r) => r.id)).toEqual(["d", "c", "b", "f", "a"]);
  });
  it("is Keep to the right and Skip to the left, with one line under the title", () => {
    const card = toCard(row({ verdict: verdict("use_now", "Try it.") }));
    expect(card).toMatchObject({ id: "00000000-0000-4000-8000-000000000001", title: "a/b", line: "Try it.", badge: "Use now", call: "use_now", right: { label: "Keep", value: "keep" }, left: { label: "Skip", value: "skip" } });
    expect(toCard(row({})).line).toBe("Seen on GitHub (MCP servers); no verdict yet.");
  });
});

describe("opening a page", () => {
  it("follows public web links only", () => {
    expect(openable("https://github.com/a/b")).toBe(true);
    expect(openable("http://localhost:3000/x")).toBe(false);
    expect(openable("http://10.0.0.4/admin")).toBe(false);
    expect(openable("http://192.168.1.1/")).toBe(false);
    expect(openable("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(openable("http://8.8.8.8/")).toBe(false);
    expect(openable("https://printer.local/")).toBe(false);
    expect(openable("file:///etc/passwd")).toBe(false);
  });
  it("keeps the words of a page and drops scripts, styles, navigation and tags", () => {
    const text = htmlToText('<html><head><style>x{}</style><script>bad()</script></head><body><nav>Home</nav><main><h1>Title</h1><p>Says what it &amp; does.</p></main><footer>f</footer></body></html>');
    expect(text).toBe("Title\nSays what it & does.");
  });
  it("skips a private address without fetching, and reports a page that will not answer", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("nope", { status: 503 });
    }) as unknown as typeof fetch;
    expect(await openFind(fetchImpl, "http://127.0.0.1/secret")).toEqual({ text: null, via: "skipped", reason: "not a public web address" });
    expect(called).toBe(0);
    expect(await openFind(fetchImpl, "https://down.example/x")).toMatchObject({ text: null, via: "failed", reason: "the page answered 503" });
  });
});

describe("the schedule", () => {
  it("runs the finds job on the hour in the day and not at night", () => {
    expect(dueJobs(9 * 60).map((j) => j.path)).toContain("/api/cron/finds");
    expect(dueJobs(9 * 60 + 5).map((j) => j.path)).not.toContain("/api/cron/finds");
    expect(dueJobs(23 * 60).map((j) => j.path)).not.toContain("/api/cron/finds");
  });
});
