/**
 * Receipts as Tess, a second user with her own space. She sees none of Phil's
 * receipts, balances or photographs, cannot reach them by id through any
 * route, and what she uploads stays hers.
 *
 * Phil's side is set up through the API secret (which acts as Phil), using
 * the same seam as receipts.phil.spec.ts: an upload that the switched-off
 * reader fails, then the rows the reader would have written.
 *
 * Everything created carries `E2E-receipts-<run>` and is removed afterwards.
 */
import { expect as baseExpect, request as playwrightRequest, test as base, type APIRequestContext, type Page } from "@playwright/test";
import { localSql, localStackEnv } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PASSWORD, PHIL, TESS } from "./support/users.ts";

/**
 * The server closes an idle connection after a few seconds, and a request
 * sent down it at that instant dies with ECONNRESET before reaching any
 * handler. Reads and idempotent writes are sent again; uploads and other
 * POSTs are not, so nothing can be created twice.
 */
function steady(api: APIRequestContext): APIRequestContext {
  const again = new Set<string | symbol>(["get", "patch", "put", "delete"]);
  return new Proxy(api, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      if (!again.has(prop)) return value.bind(target);
      return (url: string, options?: Record<string, unknown>) =>
        (value as (u: string, o: Record<string, unknown>) => unknown).call(target, url, { maxRetries: 2, ...options });
    },
  });
}

const test = base.extend({
  request: async ({ request }, use) => {
    await use(steady(request));
  },
});

const expect = baseExpect.configure({ timeout: 30_000 });
const SLOW = 120_000;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const TAG = `E2E-receipts-${RUN}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

type Detail = {
  receipt: { id: string; title: string | null; retailer: string | null; status: string; total: number | null };
  images: { storage_path: string }[];
  lines: { id: string; description: string; line_total: number }[];
  participants: { person_id: string }[];
  shares: { person_id: string; share_pct: number | null }[];
};
type Listed = { receipts: { id: string; title: string | null; retailer: string | null }[] };
type Balances = { balances: { person_id: string; display_name: string; owed: number }[] };

let phil: APIRequestContext;
const philReceipts = new Set<string>();
const tessReceipts = new Set<string>();
let philReceipt = "";
let philLine = "";
let philPerson = "";
let philSettlement = "";
let philPhoto = "";

function photo(): FormData {
  const form = new FormData();
  form.append("images", new File([PNG], `${TAG}.png`, { type: "image/png" }));
  return form;
}

async function upload(api: APIRequestContext, owned: Set<string>): Promise<string> {
  const res = await api.post("/api/receipts", { multipart: photo(), timeout: SLOW });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { receipt: { id: string } }).receipt.id;
  owned.add(id);
  return id;
}

async function detail(api: APIRequestContext, id: string): Promise<Detail> {
  const res = await api.get(`/api/receipts/${id}`, { timeout: SLOW });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Detail;
}

/** The seam: the rows the reader writes for a two-line receipt whose lines match its total. */
function enterParsedReceipt(id: string): void {
  if (!UUID.test(id) || !philReceipts.has(id)) throw new Error(`refusing to seed a receipt this spec did not create: ${id}`);
  localSql(
    `insert into public.receipt_lines (receipt_id, sort_order, description, quantity, unit_price, line_total, space_id, created_by) ` +
      `select r.id, v.n, v.d, 1, v.t, v.t, r.space_id, r.created_by from public.receipts r, ` +
      `(values (0, '${TAG} Coffee'::text, 8.00::numeric), (1, '${TAG} Filters'::text, 2.00::numeric)) as v(n, d, t) where r.id = '${id}'; ` +
      `update public.receipts set retailer = '${TAG} Roaster', purchased_at = '2031-04-01', total = 10.00, parsed_total = 10.00, ` +
      `status = 'parsed', review_reason = null, updated_at = now() where id = '${id}'`,
  );
}

/** A signed-in user's own token, for talking to the storage service the way their browser could. */
async function tokenFor(email: string): Promise<string> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function readStoredPhoto(token: string, path: string): Promise<number> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/storage/v1/object/authenticated/receipts/${path}`, {
    headers: { apikey: env.anonKey, authorization: `Bearer ${token}` },
  });
  return res.status;
}

async function during(page: Page, method: string, path: RegExp, action: () => Promise<unknown>) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname), { timeout: SLOW }),
    action(),
  ]);
  return res;
}

/**
 * The list page, once the browser has taken over. The server's first paint
 * already shows the upload button, so the list request (which only the
 * running page makes) is the signal that a chosen file will be heard.
 */
async function openList(page: Page): Promise<void> {
  await during(page, "GET", /^\/api\/receipts$/, () => page.goto("/organisation/receipts"));
  await expect(page.getByRole("heading", { name: "Receipts" })).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("Loading…")).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  phil = steady(await playwrightRequest.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } }));

  philReceipt = await upload(phil, philReceipts);
  enterParsedReceipt(philReceipt);
  const d = await detail(phil, philReceipt);
  philLine = d.lines[0].id;
  philPhoto = d.images[0].storage_path;

  const person = await phil.post("/api/people", { data: { first_name: "Dee", last_name: TAG }, timeout: SLOW });
  expect(person.status(), await person.text()).toBe(200);
  philPerson = ((await person.json()) as { person: { id: string } }).person.id;

  expect((await phil.post(`/api/receipts/${philReceipt}/participants`, { data: { person_id: philPerson }, timeout: SLOW })).status()).toBe(201);
  expect((await phil.post(`/api/receipts/${philReceipt}/lines/${philLine}/tag`, { data: { person_id: philPerson }, timeout: SLOW })).status()).toBe(200);
  const paid = await phil.post("/api/receipts/settlements", { data: { person_id: philPerson, amount: 1, paid_at: "2031-04-02", note: TAG }, timeout: SLOW });
  expect(paid.status(), await paid.text()).toBe(201);
  philSettlement = ((await paid.json()) as { settlement: { id: string } }).settlement.id;
});

test.afterAll(async ({ request }) => {
  test.setTimeout(300_000);
  for (const id of tessReceipts) await request.delete(`/api/receipts/${id}`, { timeout: SLOW }).catch(() => undefined);
  if (philSettlement) await phil.delete(`/api/receipts/settlements?id=${philSettlement}`, { timeout: SLOW }).catch(() => undefined);
  for (const id of philReceipts) await phil.delete(`/api/receipts/${id}`, { timeout: SLOW }).catch(() => undefined);
  if (philPerson) await phil.delete(`/api/people/${philPerson}?hard=1`, { timeout: SLOW }).catch(() => undefined);
  await phil.dispose();
});

test.beforeEach(() => {
  test.setTimeout(300_000);
});

test("Phil's side is really there: he owes nothing to himself and Dee owes the coffee", async () => {
  // Dee is tagged alone on the £8.00 coffee, so she holds all of it, less the £1.00 she paid.
  const mine = ((await (await phil.get("/api/receipts/balances", { timeout: SLOW })).json()) as Balances & {
    balances: { paid: number; outstanding: number }[];
  }).balances.find((b) => b.person_id === philPerson);
  expect(mine).toMatchObject({ owed: 8, paid: 1, outstanding: 7 });
});

test("Tess's receipts, balances and payments hold nothing of Phil's", async ({ page, request }) => {
  const list = (await (await request.get("/api/receipts", { timeout: SLOW })).json()) as Listed;
  expect(list.receipts.map((r) => r.id)).not.toContain(philReceipt);
  expect(list.receipts.filter((r) => `${r.title} ${r.retailer}`.includes(TAG))).toEqual([]);
  expect(((await (await request.get(`/api/receipts?retailer=${encodeURIComponent(TAG)}`, { timeout: SLOW })).json()) as Listed).receipts).toEqual([]);

  const owed = (await (await request.get("/api/receipts/balances", { timeout: SLOW })).json()) as Balances;
  expect(owed.balances.filter((b) => b.person_id === philPerson || b.display_name.includes(TAG))).toEqual([]);

  const paid = (await (await request.get("/api/receipts/settlements", { timeout: SLOW })).json()) as { settlements: { id: string }[] };
  expect(paid.settlements.map((s) => s.id)).not.toContain(philSettlement);
  const forDee = (await (await request.get(`/api/receipts/settlements?person_id=${philPerson}`, { timeout: SLOW })).json()) as { settlements: unknown[] };
  expect(forDee.settlements).toEqual([]);

  // On screen: the list has loaded and Phil's receipt is nowhere on it.
  await openList(page);
  await expect(page.locator("body")).not.toContainText(TAG);

  // A link to Phil's receipt opens nothing for her.
  expect((await during(page, "GET", new RegExp(`/api/receipts/${philReceipt}$`), () => page.goto(`/organisation/receipts?receipt=${philReceipt}`))).status()).toBe(404);
  await expect(page.getByText("This receipt could not be found.")).toBeVisible();
  await expect(page.getByLabel("Receipt title")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(TAG);

  // Her balances page is her own empty state, not his figures.
  expect((await during(page, "GET", /^\/api\/receipts\/balances$/, () => page.goto("/organisation/receipts/balances"))).status()).toBe(200);
  await expect(page.getByText("Nobody owes anything. Add people to a receipt and tag them on its lines.")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("TOTAL OUTSTANDING")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(TAG);
});

test("Tess's own empty receipts list renders", async ({ page, request }) => {
  const list = (await (await request.get("/api/receipts", { timeout: SLOW })).json()) as Listed;
  // Her space is shared with the other suites. A receipt of hers that this
  // spec did not make cannot be removed here, and the empty state cannot show
  // while it exists.
  test.skip(
    list.receipts.length > 0,
    `Tess already holds ${list.receipts.length} receipt(s) this spec did not create (${list.receipts.map((r) => r.id).join(", ")}); the empty state cannot render until they are removed`,
  );
  await openList(page);
  await expect(page.getByText("No receipts yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose photos" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Balances →" })).toBeVisible();
});

test("every route answers not found for Phil's receipt, and nothing of his changes", async ({ request }) => {
  const before = await detail(phil, philReceipt);
  const mine = await upload(request, tessReceipts);
  const r = `/api/receipts/${philReceipt}`;
  const o = { timeout: SLOW };

  const attempts: [string, () => Promise<{ status(): number }>][] = [
    ["read", () => request.get(r, o)],
    ["rename", () => request.patch(r, { data: { title: `${TAG} taken` }, ...o })],
    ["delete", () => request.delete(r, o)],
    ["edit a line", () => request.patch(`${r}/lines/${philLine}`, { data: { line_total: 0.01 }, ...o })],
    ["read a line's shares", () => request.get(`${r}/lines/${philLine}/shares`, o)],
    ["replace a line's shares", () => request.put(`${r}/lines/${philLine}/shares`, { data: { shares: [] }, ...o })],
    ["tag on a line", () => request.post(`${r}/lines/${philLine}/tag`, { data: { person_id: philPerson }, ...o })],
    ["untag on a line", () => request.delete(`${r}/lines/${philLine}/tag?person_id=${philPerson}`, o)],
    ["list participants", () => request.get(`${r}/participants`, o)],
    ["add a participant", () => request.post(`${r}/participants`, { data: { person_id: philPerson }, ...o })],
    ["remove a participant", () => request.delete(`${r}/participants?person_id=${philPerson}`, o)],
    ["reparse", () => request.post(`${r}/reparse`, o)],
    ["add a photo", () => request.post(`${r}/images`, { multipart: photo(), ...o })],
    ["merge it into her own", () => request.post("/api/receipts/merge", { data: { ids: [mine, philReceipt] }, ...o })],
    ["edit Phil's line through her own receipt", () => request.patch(`/api/receipts/${mine}/lines/${philLine}`, { data: { line_total: 0.01 }, ...o })],
    ["undo Phil's settlement", () => request.delete(`/api/receipts/settlements?id=${philSettlement}`, o)],
    ["record a payment from Phil's person", () => request.post("/api/receipts/settlements", { data: { person_id: philPerson, amount: 5 }, ...o })],
    ["put Phil's person on her own receipt", () => request.post(`/api/receipts/${mine}/participants`, { data: { person_id: philPerson }, ...o })],
  ];
  for (const [what, attempt] of attempts) {
    expect((await attempt()).status(), what).toBe(404);
  }

  const after = await detail(phil, philReceipt);
  expect(after.receipt).toEqual(before.receipt);
  expect(after.lines).toEqual(before.lines);
  expect(after.participants).toEqual(before.participants);
  expect(after.shares).toEqual(before.shares);
  expect(after.images.map((i) => i.storage_path)).toEqual(before.images.map((i) => i.storage_path));
  const settled = (await (await phil.get(`/api/receipts/settlements?person_id=${philPerson}`, { timeout: SLOW })).json()) as { settlements: { id: string }[] };
  expect(settled.settlements.map((s) => s.id)).toEqual([philSettlement]);

  // Her own receipt came through the refused merge intact.
  expect((await detail(request, mine)).images).toHaveLength(1);
  expect((await request.delete(`/api/receipts/${mine}`, { timeout: SLOW })).status()).toBe(200);
  tessReceipts.delete(mine);
});

test("what Tess uploads is hers alone, and stored photographs open only for their owner", async ({ page, request }) => {
  await openList(page);
  await expect(page.getByRole("button", { name: "Choose photos" })).toBeEnabled();
  const res = await during(page, "POST", /^\/api\/receipts$/, () =>
    page.locator('input[type="file"]').first().setInputFiles({ name: `${TAG}-tess.png`, mimeType: "image/png", buffer: PNG }),
  );
  // The reader is off: the upload is kept and marked failed, never a 5xx.
  expect(res.status()).toBe(201);
  const mine = ((await res.json()) as { receipt: { id: string } }).receipt.id;
  tessReceipts.add(mine);
  await expect(page.getByText("FAILED", { exact: true })).toBeVisible();
  await expect(page.getByText("vision_call_failed")).toBeVisible();
  await expect(page.getByRole("img", { name: "Receipt page 1" })).toBeVisible();

  const myPhoto = (await detail(request, mine)).images[0].storage_path;
  expect(myPhoto.startsWith(`${mine}/`)).toBe(true);

  // Phil cannot see it, open it or delete it.
  expect(((await (await phil.get("/api/receipts", { timeout: SLOW })).json()) as Listed).receipts.map((r) => r.id)).not.toContain(mine);
  expect((await phil.get(`/api/receipts/${mine}`, { timeout: SLOW })).status()).toBe(404);
  expect((await phil.delete(`/api/receipts/${mine}`, { timeout: SLOW })).status()).toBe(404);
  expect((await detail(request, mine)).receipt.id).toBe(mine);

  // The bucket itself: each person's own session reads their own photo and is refused the other's.
  const tess = await tokenFor(TESS.email);
  const philToken = await tokenFor(PHIL.email);
  expect(await readStoredPhoto(tess, myPhoto), "Tess, her own photo").toBe(200);
  expect(await readStoredPhoto(philToken, philPhoto), "Phil, his own photo").toBe(200);
  expect(await readStoredPhoto(tess, philPhoto), "Tess, Phil's photo").toBeGreaterThanOrEqual(400);
  expect(await readStoredPhoto(philToken, myPhoto), "Phil, Tess's photo").toBeGreaterThanOrEqual(400);

  expect((await request.delete(`/api/receipts/${mine}`, { timeout: SLOW })).status()).toBe(200);
  tessReceipts.delete(mine);
  expect((await request.get(`/api/receipts/${mine}`, { timeout: SLOW })).status()).toBe(404);
  await expect
    .poll(() => Number(localSql(`select count(*) from storage.objects where bucket_id = 'receipts' and name like '${mine}/%'`)[0][0]), { timeout: 30_000 })
    .toBe(0);
});
