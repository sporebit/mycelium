import { describe, expect, it } from "vitest";
import { isGithubRepo, kindFromHost, linksIn, normaliseUrl, readShare, titleFromUrl } from "./url";

describe("normaliseUrl — one key per page", () => {
  it("drops tracking, fragments, www and a trailing slash, and lowers the host", () => {
    expect(normaliseUrl("HTTPS://WWW.GitHub.com/Owner/Repo/?utm_source=x&ref=hn#readme")).toBe("https://github.com/Owner/Repo");
    expect(normaliseUrl("http://example.org/a/b/")).toBe("https://example.org/a/b");
  });
  it("keeps real parameters, sorted, so order does not make two keys", () => {
    expect(normaliseUrl("https://x.com/a?b=2&a=1&t=xyz")).toBe("https://x.com/a?a=1&b=2");
  });
  it("reads twitter and x as one site", () => {
    expect(normaliseUrl("https://twitter.com/someone/status/1")).toBe("https://x.com/someone/status/1");
    expect(normaliseUrl("https://mobile.twitter.com/someone/status/1")).toBe("https://x.com/someone/status/1");
  });
  it("refuses what is not a web link", () => {
    expect(normaliseUrl("ftp://files.example/x")).toBeNull();
    expect(normaliseUrl("not a link")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("linksIn", () => {
  it("finds every link and leaves the punctuation after it", () => {
    expect(linksIn("see https://a.example/x, and (https://b.example/y).")).toEqual(["https://a.example/x", "https://b.example/y"]);
  });
});

describe("kindFromHost", () => {
  it("knows the find hosts", () => {
    expect(kindFromHost("https://github.com/a/b")).toBe("repo");
    expect(kindFromHost("https://gist.github.com/a/123")).toBe("repo");
    expect(kindFromHost("https://x.com/a/status/1")).toBe("post");
    expect(kindFromHost("https://twitter.com/a/status/1")).toBe("post");
    expect(kindFromHost("https://smithery.ai/server/x")).toBe("skill");
    expect(kindFromHost("https://www.producthunt.com/posts/x")).toBe("tool");
    expect(kindFromHost("https://arxiv.org/abs/1")).toBe("article");
  });
  it("says nothing about a shop or a video site", () => {
    expect(kindFromHost("https://www.amazon.co.uk/dp/1")).toBeNull();
    expect(kindFromHost("https://www.youtube.com/watch?v=1")).toBeNull();
  });
});

describe("isGithubRepo", () => {
  it("is the owner/name page and nothing else", () => {
    expect(isGithubRepo("https://github.com/a/b")).toBe(true);
    expect(isGithubRepo("https://github.com/a/b/issues/3")).toBe(false);
    expect(isGithubRepo("https://github.com/a")).toBe(false);
    expect(isGithubRepo("https://github.com/topics/mcp")).toBe(false);
  });
});

describe("readShare — a link with a few words is a find", () => {
  it("takes the words as the title and the host as the kind", () => {
    expect(readShare("look at this later https://github.com/e2e/thing?utm_source=app")).toEqual({ url: "https://github.com/e2e/thing", kind: "repo", title: "look at this later" });
  });
  it("names the thing from the link when there are no words", () => {
    expect(readShare("https://github.com/e2e/thing")).toEqual({ url: "https://github.com/e2e/thing", kind: "repo", title: "e2e/thing" });
    expect(readShare("https://x.com/someone/status/12")?.title).toBe("a post by @someone");
  });
  it("leaves a long thought, two links, or a shop link to the classifier", () => {
    expect(readShare("I was thinking about the garden and the shed roof and whether the gutter needs doing before winter which it probably does https://github.com/a/b")).toBeNull();
    expect(readShare("https://github.com/a/b https://github.com/c/d")).toBeNull();
    expect(readShare("buy this https://www.amazon.co.uk/dp/1")).toBeNull();
    expect(readShare("no link at all")).toBeNull();
  });
});

describe("titleFromUrl", () => {
  it("is owner/name for a repo and host/path otherwise", () => {
    expect(titleFromUrl("https://github.com/owner/name/tree/main")).toBe("owner/name");
    expect(titleFromUrl("https://blog.example/posts/one/two/three")).toBe("blog.example/posts/one");
    expect(titleFromUrl("https://blog.example")).toBe("blog.example");
  });
});
