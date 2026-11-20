/**
 * The Finds feed (MYC-190; master run §12), end to end as Phil on the local
 * stack. The watchers read saved replies (e2e/fixtures/finds, through
 * FINDS_FIXTURE_DIR) so no run reaches GitHub, Hacker News or a feed; the
 * PC's part is played through the worker's own claim and finish routes.
 *
 *   - a link shared in with a few words is a find, kept once however many
 *     times the same page comes in;
 *   - the daily turn records each fixture find once, with its source, and
 *     a second turn adds nothing;
 *   - a verdict job carries the opened page to the PC, and the PC's answer
 *     lands on the find; a bad answer is left for the cloud route;
 *   - Keep and Skip; the export in the resources format;
 *   - nobody else sees any of it; the page shows the week.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import type { FindRow, SourceRow } from "../lib/finds/types.ts";
import { captured, tidyCaptures } from "./capture.helpers.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, storageStateFor, TESS } from "./support/users.ts";

const RUN = `e2e-finds-${Date.now().toString(36)}`;
const SHARED = `https://github.com/e2e-finds/shared-${RUN}`;
const FIXTURE_URLS = ["https://github.com/e2e-finds/mcp-house-server", "https://skillfile.example.org", "https://news.ycombinator.com/item?id=90000002", "https://blog.e2e-finds.example/motion-tokens", "https://github.com/advisories/GHSA-e2ef-inds-0001"];
const WORKER = `e2e-finds-worker`;

let phil: APIRequestContext;
let sys: APIRequestContext;
const captures: string[] = [];
let sharedId = "";

const finds = async (who: APIRequestContext, days = 7) => ((await (await who.get(`/api/finds?days=${days}`)).json()) as { finds: FindRow[] }).finds;
const byUrl = (rows: FindRow[], url: string) => rows.find((f) => f.url === url);
const urlList = () => [SHARED, ...FIXTURE_URLS].map((u) => `'${u}'`).join(",");
const tidy = () => {
  localSql(`delete from public.jobs where kind in ('finds_verdict', 'npm_audit') and created_by = '${PHIL.id}'`);
  localSql(`delete from public.finds where url in (${urlList()}) or raw->>'text_in' like '%${RUN}%'`);
  localSql(`delete from public.workers where name = '${WORKER}'`);
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  sys = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${E2E_CRON_SECRET}` }, timeout: 90_000 });
  tidy();
  // The watchers run once a day; a run earlier today (another suite, a previous attempt) would make this one skip them.
  localSql(`update public.find_sources set last_run_at = null where space_id = '${personalSpace(PHIL)}'`);
});

test.afterAll(async () => {
  await tidyCaptures(phil, captures);
  tidy();
  await phil.dispose();
  await sys.dispose();
});

test("a link shared in with a few words is a find, filed without a model, and the same page twice is one find", async () => {
  const first = await captured(phil, `look at this later ${SHARED}?utm_source=share&ref=x`);
  captures.push(first.id);
  expect(first).toMatchObject({ routed_to: "finds", llm_source: "regex" });
  expect(first.classification).toMatchObject({ kind: "find", title: "look at this later", url: SHARED });
  sharedId = first.routed_id!;

  const rows = await finds(phil);
  const mine = byUrl(rows, SHARED);
  expect(mine).toMatchObject({ id: sharedId, source: "share", kind: "repo", title: "look at this later", verdict: null, answer: null, capture_id: first.id });

  // A verdict job waits for the PC, one per find.
  const jobs = localSql(`select status, lane from public.jobs where kind = 'finds_verdict' and payload->>'find_id' = '${sharedId}'`);
  expect(jobs).toEqual([["queued", "pc"]]);

  // The same page again, written differently: the capture is filed, but it points at the find that already exists.
  const again = await captured(phil, `${SHARED.replace("https://", "https://www.")}/`);
  captures.push(again.id);
  expect(again.routed_to).toBe("finds");
  expect(again.routed_id).toBe(sharedId);
  expect((await finds(phil)).filter((f) => f.url === SHARED)).toHaveLength(1);
});

test("a link to a shop, or a link inside a longer thought, is not taken as a find", async () => {
  const shop = await captured(phil, `buy a mouthguard https://www.amazon.co.uk/dp/${RUN}`);
  captures.push(shop.id);
  expect(shop.routed_to).not.toBe("finds");
  expect(shop.classification.kind).not.toBe("find");
});

test("nobody without the secret can run the daily turn", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/cron/finds")).status()).toBe(401);
  expect((await phil.get("/api/cron/finds")).status()).toBe(401);
  await anon.dispose();
});

test("the daily turn records each fixture find once, with its source, and a second turn adds nothing", async () => {
  const res = await sys.post(`/api/cron/finds?user=${PHIL.id}`);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { ok: boolean; users: number; sources_run: number; new: number; queued: number; errors: string[] };
  expect(body.ok).toBe(true);
  expect(body.users).toBe(1);
  expect(body.errors).toEqual([]);
  // GitHub, Hacker News, the feeds (as one), the advisory database, and npm audit queued for the PC.
  expect(body.sources_run).toBeGreaterThanOrEqual(5);
  expect(body.new).toBeGreaterThanOrEqual(FIXTURE_URLS.length);
  expect(body.queued).toBe(body.new);

  const rows = await finds(phil);
  expect(byUrl(rows, FIXTURE_URLS[0])).toMatchObject({ source: "github", source_ref: "MCP servers", kind: "skill", title: "e2e-finds/mcp-house-server" });
  expect(byUrl(rows, FIXTURE_URLS[1])).toMatchObject({ source: "hn", kind: "article" });
  expect(byUrl(rows, FIXTURE_URLS[2])).toMatchObject({ source: "hn", kind: "post" });
  expect(byUrl(rows, FIXTURE_URLS[3])).toMatchObject({ source: "rss", kind: "article" });
  expect(byUrl(rows, FIXTURE_URLS[4])).toMatchObject({ source: "advisory", kind: "advisory", source_ref: "next" });
  expect((byUrl(rows, FIXTURE_URLS[0])!.raw as { stars: number }).stars).toBe(120);

  // npm audit is the PC's: a job on its lane, once a week.
  expect(localSql(`select count(*) from public.jobs where kind = 'npm_audit' and created_by = '${PHIL.id}' and status = 'queued'`)[0][0]).toBe("1");

  // The sources remember the run.
  const sources = ((await (await phil.get("/api/finds/sources")).json()) as { sources: SourceRow[] }).sources;
  expect(sources.map((s) => s.kind).sort()).toEqual(["advisory", "audit", "github", "hn", "imap", "rss", "rss", "rss", "rss", "rss"]);
  expect(sources.find((s) => s.kind === "github")?.last_run_at).not.toBeNull();
  expect(sources.find((s) => s.kind === "imap")).toMatchObject({ enabled: false, last_run_at: null });

  // The same day again: the watchers are not re-read, and nothing is added. Forced, they are re-read and still nothing is new.
  const again = (await (await sys.post(`/api/cron/finds?user=${PHIL.id}`)).json()) as { sources_run: number; new: number };
  expect(again).toMatchObject({ sources_run: 0, new: 0 });
  const forced = (await (await sys.post(`/api/cron/finds?user=${PHIL.id}&force=1`)).json()) as { sources_run: number; new: number; found: number };
  expect(forced.new).toBe(0);
  expect(forced.found).toBeGreaterThan(0);
});

test("the PC's verdict: the job carries the opened page, the answer lands on the find, and a bad answer is left for the cloud", async () => {
  const claim = await sys.post("/api/worker/claim", { data: { worker: WORKER, kinds: ["finds_verdict"], limit: 20 } });
  expect(claim.status(), await claim.text()).toBe(200);
  const { jobs } = (await claim.json()) as { jobs: Array<{ id: string; kind: string; payload: Record<string, unknown> }> };
  const mine = jobs.find((j) => j.payload.find_id === sharedId);
  expect(mine, "the shared find's verdict job was claimed").toBeTruthy();
  // prepare() opened the page (the README fixture, for a GitHub repo) and wrote the prompt.
  expect(mine!.payload.json).toBe(true);
  expect(String(mine!.payload.system)).toContain("Never tell the person to install anything");
  expect(String(mine!.payload.user)).toContain(`url: ${SHARED}`);
  expect(String(mine!.payload.user)).toContain("Exposes a house's sensors and switches");
  expect((byUrl(await finds(phil), SHARED)!.raw as { opened_via?: string }).opened_via).toBe("readme");

  const answer = { what: "An MCP server for a house's sensors.", cost: "free", licence: "MIT", cautions: "young project", verdict: "use_now", suits: ["Mycelium"], summary: "Free, fits the house; worth an hour." };
  const finish = await sys.post("/api/worker/finish", { data: { worker: WORKER, id: mine!.id, ok: true, result: { text: JSON.stringify(answer), model: "e2e", seconds: 1 } } });
  expect(finish.status(), await finish.text()).toBe(200);
  const judged = byUrl(await finds(phil), SHARED)!;
  expect(judged.verdict).toEqual(answer);
  expect(judged.verdict_by).toBe("pc");
  expect(judged.verdicted_at).not.toBeNull();

  // A second finish for the same job is refused; the verdict stays as it was.
  expect((await sys.post("/api/worker/finish", { data: { worker: WORKER, id: mine!.id, ok: true, result: { text: "{}" } } })).status()).toBe(409);

  // An answer that is not a verdict is not written down as one.
  const other = jobs.find((j) => j.payload.find_id !== sharedId);
  expect(other).toBeTruthy();
  expect((await sys.post("/api/worker/finish", { data: { worker: WORKER, id: other!.id, ok: true, result: { text: "It seems alright I suppose." } } })).status()).toBe(200);
  const left = (await finds(phil)).find((f) => f.id === other!.payload.find_id)!;
  expect(left.verdict).toBeNull();
  expect((left.raw as { pc_failed?: string }).pc_failed).toContain("not a verdict");
});

test("Keep and Skip, and the answer can be taken back", async () => {
  const keep = await phil.patch(`/api/finds/${sharedId}`, { data: { answer: "keep" } });
  expect(keep.status()).toBe(200);
  expect(((await keep.json()) as { find: FindRow }).find).toMatchObject({ answer: "keep" });
  expect(byUrl(await finds(phil), SHARED)!.answered_at).not.toBeNull();

  const skip = await phil.patch(`/api/finds/${sharedId}`, { data: { answer: "skip" } });
  expect(((await skip.json()) as { find: FindRow }).find.answer).toBe("skip");
  const clear = await phil.patch(`/api/finds/${sharedId}`, { data: { answer: null } });
  expect(((await clear.json()) as { find: FindRow }).find).toMatchObject({ answer: null, answered_at: null });

  expect((await phil.patch(`/api/finds/${sharedId}`, { data: { answer: "maybe" } })).status()).toBe(400);
  expect((await phil.patch(`/api/finds/not-an-id`, { data: { answer: "keep" } })).status()).toBe(404);
});

test("the export is the week in the resources record's shape", async () => {
  const res = await phil.get("/api/finds/export?days=7");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/markdown");
  const md = await res.text();
  expect(md).toContain("| Find | Source | What it does | Cost | Licence | Verdict | Could also help | Cautions | Opened | Answer |");
  expect(md).toContain(`| [look at this later](${SHARED}) | shared | An MCP server for a house's sensors. | free | MIT | Use now | Mycelium | young project | yes | — |`);
  expect(md).toContain("## Use now (free)");
  expect(md).toContain("Nothing here was installed");
});

test("a link kept by hand on the page's form is a find too, and a sources feed can be added and removed", async () => {
  const url = `https://x.com/e2e_finds/status/${Date.now()}`;
  const res = await phil.post("/api/finds", { data: { url, title: "a post to read" } });
  expect(res.status(), await res.text()).toBe(200);
  const { find } = (await res.json()) as { find: FindRow };
  expect(find).toMatchObject({ url, title: "a post to read", kind: "post", source: "share" });
  expect((await phil.post("/api/finds", { data: { url: "not a link" } })).status()).toBe(400);
  localSql(`delete from public.finds where id = '${find.id}'`);
  localSql(`delete from public.jobs where kind = 'finds_verdict' and payload->>'find_id' = '${find.id}'`);

  const feed = `https://feed.e2e-finds.example/${RUN}.xml`;
  const added = await phil.post("/api/finds/sources", { data: { url: feed, label: `E2E ${RUN}` } });
  expect(added.status(), await added.text()).toBe(200);
  const { source } = (await added.json()) as { source: SourceRow };
  expect(source).toMatchObject({ kind: "rss", target: feed, enabled: true });
  // Added twice is the same row.
  expect(((await (await phil.post("/api/finds/sources", { data: { url: feed } })).json()) as { source: SourceRow }).source.id).toBe(source.id);
  expect((await phil.put("/api/finds/sources", { data: { id: source.id, enabled: false } })).status()).toBe(200);
  expect((await phil.delete(`/api/finds/sources?id=${source.id}`)).status()).toBe(200);
  const sources = ((await (await phil.get("/api/finds/sources")).json()) as { sources: SourceRow[] }).sources;
  expect(sources.find((s) => s.id === source.id)).toBeUndefined();
  // A built-in source is switched off, never removed.
  const github = sources.find((s) => s.kind === "github")!;
  expect((await phil.delete(`/api/finds/sources?id=${github.id}`)).status()).toBe(200);
  expect(((await (await phil.get("/api/finds/sources")).json()) as { sources: SourceRow[] }).sources.find((s) => s.id === github.id)).toBeTruthy();
});

test("nobody else sees Phil's finds or his sources", async ({ playwright }) => {
  const tess = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: storageStateFor(TESS) });
  const hers = await finds(tess);
  expect(hers.filter((f) => [SHARED, ...FIXTURE_URLS].includes(f.url))).toEqual([]);
  expect((await tess.get(`/api/finds/${sharedId}`)).status()).toBe(404);
  expect((await tess.patch(`/api/finds/${sharedId}`, { data: { answer: "keep" } })).status()).toBe(404);
  expect((await tess.get("/api/finds/export")).status()).toBe(200);
  expect(await (await tess.get("/api/finds/export")).text()).not.toContain(SHARED);
  // Her sources are her own seed, untouched by Phil's run.
  const hersSources = ((await (await tess.get("/api/finds/sources")).json()) as { sources: SourceRow[] }).sources;
  expect(hersSources.every((s) => s.last_run_at === null)).toBe(true);
  localSql(`delete from public.find_sources where space_id = '${personalSpace(TESS)}'`);
  await tess.dispose();
});

test("the page shows the week with verdicts, Keep and Skip in place, and the sources", async ({ page }) => {
  await page.goto("/studio/finds");
  await expect(page.getByTestId("finds-page")).toBeVisible();
  const row = page.locator(`[data-find-id="${sharedId}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("find-verdict")).toHaveText("Use now");
  await row.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(row.getByRole("button", { name: "Keep", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => byUrl(await finds(phil), SHARED)?.answer).toBe("keep");
  await expect(page.getByTestId("find-row")).toHaveCount((await finds(phil)).length);
  await expect(page.getByTestId("finds-sources")).toBeVisible();
  await expect(page.locator('[data-testid="find-source"][data-kind="imap"] input')).toBeDisabled();
  await expect(page.getByTestId("finds-export")).toHaveAttribute("href", "/api/finds/export?days=7");

  // The capture that brought the find in waits in the review queue like any other, with "find" as its kind
  // (before the fix the kind list had no "find", so the select fell back to its first entry, "task").
  await page.goto("/organisation/captures/review");
  const title = page.locator("input[value='look at this later']").first();
  await expect(title).toBeVisible();
  const card = title.locator("xpath=ancestor::*[.//select][1]");
  await expect(card.locator("select").first()).toHaveValue("find");
});
